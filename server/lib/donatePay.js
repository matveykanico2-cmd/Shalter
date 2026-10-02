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
    if (amountRub < order.amountRub) continue;
    await fulfillOrder(order).catch((err) => console.error("DonatePay fulfill failed:", err));
  }
  if (maxId !== state.lastTransactionId) saveState(maxId);
}

const POLL_INTERVAL_MS = 30_000;
function startDonatePaySweep() {
  if (!isConfigured()) return;
  setInterval(() => {
    pollOnce().catch((err) => console.error("DonatePay poll failed:", err));
  }, POLL_INTERVAL_MS);
}

module.exports = { isConfigured, getDonationPageUrl, startDonatePaySweep, pollOnce };
