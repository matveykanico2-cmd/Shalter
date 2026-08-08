// Real automatic payment via DonationAlerts (donationalerts.com) instead of
// the old "message the admin, wait for them to confirm by hand" flow (still
// the fallback — see isConfigured() — for a deployment that hasn't connected
// this). A donation counts as a *gift to a private individual*, not payment
// for goods/services, which is why solo devs in Russia lean on donation
// platforms instead of a payment gateway that'd require registering as
// self-employed/ИП — same reasoning as this app's whole "no payment gateway"
// design (see AGENTS.md/DEPLOY.md).
//
// Flow: /request (premium.js/ads.js/gifts.js) creates a pending_orders row
// with a short code and hands the user a donation link + that code to put in
// the donation message. A periodic sweep (startDonationAlertsSweep, called
// from server/index.js like the auto-delete sweep) polls DonationAlerts'
// own donations list, and for each new one whose message contains a known
// pending code, fulfills that order — grants Premium/ads/delivers the gift
// and notifies the buyer, exactly like the admin's manual /grant used to.
//
// I don't have a real DonationAlerts account to test this end-to-end
// against — the OAuth flow, token refresh, and (especially) the exact
// donation-list response shape are built from DonationAlerts' documented
// API, but the field names below (amount_in_user_currency etc.) should be
// verified against a real test donation once this is connected for real;
// see the comment on parseDonation() below for where to adjust if the shape
// doesn't match.
const db = require("../db");
const { DONATIONALERTS_CLIENT_ID, DONATIONALERTS_CLIENT_SECRET, DONATIONALERTS_REDIRECT_URI } = require("../config");
const { getPendingOrderByCode, markOrderFulfilled } = require("../data/pendingOrders");
const { grantPremiumDays, grantAdsDays, addReceivedGift, getUser } = require("../data/users");
const { getGift } = require("../data/gifts");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");

const TOKEN_URL = "https://www.donationalerts.com/oauth/token";
const AUTHORIZE_URL = "https://www.donationalerts.com/oauth/authorize";
const API_BASE = "https://www.donationalerts.com/api/v1";
// A pending code sits in the donor's free-text message, so it has to be
// unmistakable — "SHP-XXXXXX", matched case-insensitively since donors will
// paste/type it every which way.
const CODE_RE = /SHP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/i;

function isConfigured() {
  return !!(DONATIONALERTS_CLIENT_ID && DONATIONALERTS_CLIENT_SECRET && DONATIONALERTS_REDIRECT_URI);
}

function loadAuth() {
  return db.prepare("SELECT * FROM donation_alerts_auth WHERE id = 1").get();
}

function saveAuth(patch) {
  const current = loadAuth() ?? {};
  const next = { ...current, ...patch };
  db.prepare(
    `INSERT INTO donation_alerts_auth (id, accessToken, refreshToken, expiresAt, username, lastDonationId)
     VALUES (1, @accessToken, @refreshToken, @expiresAt, @username, @lastDonationId)
     ON CONFLICT(id) DO UPDATE SET accessToken = excluded.accessToken, refreshToken = excluded.refreshToken,
       expiresAt = excluded.expiresAt, username = excluded.username, lastDonationId = excluded.lastDonationId`
  ).run({
    accessToken: next.accessToken ?? null,
    refreshToken: next.refreshToken ?? null,
    expiresAt: next.expiresAt ?? null,
    username: next.username ?? null,
    lastDonationId: next.lastDonationId ?? 0,
  });
}

function isConnected() {
  const auth = loadAuth();
  return !!auth?.accessToken;
}

// The admin's public donation page — where a buyer actually sends money and
// types the pending-order code. DonationAlerts' page URL is just
// donationalerts.com/r/<username>, no API call needed to build it.
function getDonationPageUrl() {
  const auth = loadAuth();
  return auth?.username ? `https://www.donationalerts.com/r/${auth.username}` : null;
}

function getAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: DONATIONALERTS_CLIENT_ID,
    redirect_uri: DONATIONALERTS_REDIRECT_URI,
    response_type: "code",
    scope: "oauth-donation-index oauth-user-show",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: DONATIONALERTS_CLIENT_ID,
      client_secret: DONATIONALERTS_CLIENT_SECRET,
      redirect_uri: DONATIONALERTS_REDIRECT_URI,
      code,
    }),
  });
  if (!res.ok) throw new Error(`DonationAlerts token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();

  let username = null;
  try {
    const userRes = await fetch(`${API_BASE}/user/oauth`, { headers: { Authorization: `Bearer ${data.access_token}` } });
    if (userRes.ok) username = (await userRes.json())?.data?.name ?? null;
  } catch {
    // Non-fatal — the connection still works without a display name, it's
    // only used for the "Подключено как @username" line in Settings.
  }

  saveAuth({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000).toISOString(),
    username,
  });
}

async function refreshAccessToken(auth) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: DONATIONALERTS_CLIENT_ID,
      client_secret: DONATIONALERTS_CLIENT_SECRET,
      refresh_token: auth.refreshToken,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  saveAuth({ accessToken: data.access_token, refreshToken: data.refresh_token ?? auth.refreshToken, expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000).toISOString() });
  return data.access_token;
}

async function getValidAccessToken() {
  const auth = loadAuth();
  if (!auth?.accessToken) return null;
  // 60s safety margin so a request in flight doesn't get cut off right as
  // the token expires.
  if (auth.expiresAt && new Date(auth.expiresAt).getTime() > Date.now() + 60_000) return auth.accessToken;
  if (!auth.refreshToken) return null;
  return refreshAccessToken(auth);
}

// DonationAlerts' documented shape has both `amount` (in the donation's own
// currency) and `amount_in_user_currency` (converted to the streamer/
// account's currency — RUB here) — the latter is what a "20₽" pending order
// should be compared against, not the raw `amount`. If DonationAlerts ever
// changes this field name, this is the one spot that needs updating.
function parseDonation(raw) {
  const amountRub = Number(raw.amount_in_user_currency ?? raw.amount ?? 0);
  const message = String(raw.message ?? "");
  const match = message.match(CODE_RE);
  return { id: raw.id, amountRub, code: match ? match[0].toUpperCase() : null };
}

async function fulfillOrder(order) {
  const buyer = await getUser(order.userId);
  if (!buyer) return;
  let text;
  let extra;

  if (order.kind === "premium") {
    await grantPremiumDays(order.userId, 30);
    text = "🎉 Оплата получена! Вам выдан Shalter Premium на 30 дней. Спасибо, что поддерживаете проект.";
  } else if (order.kind === "ads") {
    await grantAdsDays(order.userId, 30);
    text = "📢 Оплата получена! Вам выдан кабинет рекламы на 30 дней. Настройте объявление в Настройки → Реклама.";
  } else if (order.kind === "gift") {
    const gift = getGift(order.giftId);
    if (!gift) return;
    const recipientId = order.recipientId || order.userId;
    if (gift.premiumDays !== 0) await grantPremiumDays(recipientId, gift.premiumDays);
    await addReceivedGift(recipientId, { emoji: gift.emoji, name: gift.name, fromId: order.userId, at: new Date().toISOString() });
    const duration = gift.premiumDays === 0 ? null : gift.premiumDays == null ? "Premium навсегда" : `Premium на ${gift.premiumDays} дней`;
    text = `🎁 Оплата получена! Вам подарили: ${gift.emoji} «${gift.name}»!${duration ? ` ${duration} активирован.` : ""}`;
    extra = { type: "gift", gift: { emoji: gift.emoji, name: gift.name, priceRub: gift.priceRub, premiumDays: gift.premiumDays, durationLabel: duration } };
    // Recipient gets the gift card; buyer (if gifting someone else) gets a
    // separate plain confirmation so both sides see something.
    const recipientChat = await findOrCreateDm(SYSTEM_BOT_ID, recipientId);
    await sendMessageAndBroadcast(recipientChat, SYSTEM_BOT_ID, text, extra);
    if (recipientId !== order.userId) {
      const buyerChat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
      await sendMessageAndBroadcast(buyerChat, SYSTEM_BOT_ID, `✅ Оплата получена — подарок «${gift.name}» доставлен.`);
    }
    await markOrderFulfilled(order.id);
    return;
  } else {
    return;
  }

  const chat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
  await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, extra);
  await markOrderFulfilled(order.id);
}

async function pollOnce() {
  if (!isConfigured()) return;
  const token = await getValidAccessToken();
  if (!token) return;
  const auth = loadAuth();

  const res = await fetch(`${API_BASE}/alerts/donations?page=1`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const body = await res.json().catch(() => null);
  const donations = Array.isArray(body?.data) ? body.data : [];

  const fresh = donations.filter((d) => Number(d.id) > (auth.lastDonationId ?? 0)).sort((a, b) => a.id - b.id);
  let maxId = auth.lastDonationId ?? 0;
  for (const raw of fresh) {
    maxId = Math.max(maxId, Number(raw.id));
    const { code, amountRub } = parseDonation(raw);
    if (!code) continue;
    const order = await getPendingOrderByCode(code);
    if (!order || order.status !== "pending") continue;
    if (amountRub < order.amountRub) continue; // underpaid — leave pending, don't silently short-fulfill
    await fulfillOrder(order).catch((err) => console.error("donation fulfill failed:", err));
  }
  if (maxId !== auth.lastDonationId) saveAuth({ lastDonationId: maxId });
}

const POLL_INTERVAL_MS = 30_000;
function startDonationAlertsSweep() {
  if (!isConfigured()) return;
  setInterval(() => {
    pollOnce().catch((err) => console.error("DonationAlerts poll failed:", err));
  }, POLL_INTERVAL_MS);
}

module.exports = {
  isConfigured,
  isConnected,
  loadAuth,
  getAuthorizeUrl,
  getDonationPageUrl,
  exchangeCodeForTokens,
  startDonationAlertsSweep,
  pollOnce,
};
