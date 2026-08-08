const crypto = require("crypto");
const db = require("../db");

// Same "no ambiguous characters" alphabet as users.js's referral codes — a
// donor has to type this into a free-text donation message field, so 0/O/1/I
// mix-ups matter here even more than for a referral link.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function rowToOrder(row) {
  if (!row) return undefined;
  return { ...row };
}

function generateOrderCode() {
  for (;;) {
    let code = "SHP-";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    const exists = db.prepare("SELECT 1 FROM pending_orders WHERE code = ?").get(code);
    if (!exists) return code;
  }
}

async function createPendingOrder({ userId, kind, giftId, recipientId, amountRub }) {
  const order = {
    id: `po_${Date.now()}`,
    code: generateOrderCode(),
    userId,
    kind,
    giftId: giftId ?? null,
    recipientId: recipientId ?? null,
    amountRub,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO pending_orders (id, code, userId, kind, giftId, recipientId, amountRub, status, createdAt)
     VALUES (@id, @code, @userId, @kind, @giftId, @recipientId, @amountRub, @status, @createdAt)`
  ).run(order);
  return order;
}

async function getPendingOrderByCode(code) {
  return rowToOrder(db.prepare("SELECT * FROM pending_orders WHERE code = ?").get(code));
}

async function markOrderFulfilled(id) {
  db.prepare("UPDATE pending_orders SET status = 'fulfilled' WHERE id = ?").run(id);
}

module.exports = { createPendingOrder, getPendingOrderByCode, markOrderFulfilled };
