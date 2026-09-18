// Real automatic payment via DonatePay (donatepay.ru) — a second option
// alongside DonationAlerts (server/lib/donationAlerts.js), same reasoning:
// a donation is a gift to a private individual, not payment for goods/
// services, which is why this and DonationAlerts are the two rails instead
// of a real payment gateway (see AGENTS.md/DEPLOY.md).
//
// Simpler than DonationAlerts on purpose: DonatePay hands out one static API
// token from the account's own API page — no OAuth app, no client secret, no
// redirect URI, no refresh flow. The tradeoff is that the token can't be
// scoped or expired on its own; treat it exactly like a password (env var
// only, never logged, never sent to a client).
//
// Endpoints and response shape below are NOT from an official reachable
// doc — donatepay.ru's own API page requires being logged into an account,
// which this deployment isn't. They're taken from a third-party open-source
// C# client (github.com/antim0118/DonatePayAPI, MIT, archived but the code
// matches DonatePay's actual HTTP responses at the time it was written):
//   GET  https://donatepay.ru/api/v1/user?access_token=TOKEN
//   GET  https://donatepay.ru/api/v1/transactions?access_token=TOKEN&...
// If DonatePay has changed their API shape since, pollOnce() below will
// simply see no matching fields and fulfill nothing — it fails closed, not
// by crediting the wrong thing. Treat the first real test donation as the
// actual verification, the same way DonationAlerts' integration comment
// recommends.
const db = require("../db");
const { DONATEPAY_API_TOKEN, DONATEPAY_PAGE_URL } = require("../config");
const { getPendingOrderByCode, CODE_RE } = require("../data/pendingOrders");
const { fulfillOrder } = require("./fulfillOrder");

const API_BASE = "https://donatepay.ru/api/v1";

function isConfigured() {
  return !!(DONATEPAY_API_TOKEN && DONATEPAY_PAGE_URL);
}

function getDonationPageUrl() {
  return DONATEPAY_PAGE_URL || null;
}

function loadState() {
  return db.prepare("SELECT * FROM donate_pay_state WHERE id = 1").get() ?? { lastTransactionId: 0 };
}

function saveState(lastTransactionId) {
  db.prepare(
    `INSERT INTO donate_pay_state (id, lastTransactionId) VALUES (1, @lastTransactionId)
     ON CONFLICT(id) DO UPDATE SET lastTransactionId = excluded.lastTransactionId`
  ).run({ lastTransactionId });
}

// `sum` in DonatePay's transaction list is a numeric string, always in
// rubles (DonatePay is a Russian-only service — unlike DonationAlerts,
// there's no separate currency field to check). The pending code is looked
// for in whichever of `comment`/`vars.comment` actually has text — the
// third-party client this is based on reads both, and it costs nothing to
// check the one that's populated.
function parseTransaction(raw) {
  const amountRub = Number(raw.sum ?? 0);
  const message = String(raw.comment ?? raw.vars?.comment ?? "");
  const match = message.match(CODE_RE);
  return { id: Number(raw.id), amountRub, code: match ? match[0].toUpperCase() : null };
}

async function pollOnce() {
  if (!isConfigured()) return;
  const state = loadState();

  const params = new URLSearchParams({
    access_token: DONATEPAY_API_TOKEN,
    limit: "50",
    order: "DESC",
    type: "donation",
    status: "success",
  });
  const res = await fetch(`${API_BASE}/transactions?${params}`);
  if (!res.ok) return;
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body?.data) ? body.data : [];

  const fresh = rows.filter((r) => Number(r.id) > state.lastTransactionId).sort((a, b) => a.id - b.id);
  let maxId = state.lastTransactionId;
  for (const raw of fresh) {
    maxId = Math.max(maxId, Number(raw.id));
    const { code, amountRub } = parseTransaction(raw);
    if (!code) continue;
    const order = await getPendingOrderByCode(code);
    if (!order || order.status !== "pending") continue;
    if (amountRub < order.amountRub) continue; // underpaid — leave pending, don't silently short-fulfill
    await fulfillOrder(order).catch((err) => console.error("DonatePay fulfill failed:", err));
  }
  if (maxId !== state.lastTransactionId) saveState(maxId);
}

// Same interval as DonationAlerts' sweep — comfortably above the "one
// request per 20s" rate limit noted against this API elsewhere.
const POLL_INTERVAL_MS = 30_000;
function startDonatePaySweep() {
  if (!isConfigured()) return;
  setInterval(() => {
    pollOnce().catch((err) => console.error("DonatePay poll failed:", err));
  }, POLL_INTERVAL_MS);
}

module.exports = { isConfigured, getDonationPageUrl, startDonatePaySweep, pollOnce };
