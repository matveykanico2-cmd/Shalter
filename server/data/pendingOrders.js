const crypto = require("crypto");
const { genId } = require("../lib/genId");
const db = require("../db");

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const CODE_RE = /SHP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/i;

function rowToOrder(row) {
  if (!row) return undefined;
  const { meta, ...rest } = row;
  let parsed = null;
  try {
    parsed = meta ? JSON.parse(meta) : null;
  } catch {}
  return { ...rest, meta: parsed };
}

function generateOrderCode() {
  for (;;) {
    let code = "SHP-";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    const exists = db.prepare("SELECT 1 FROM pending_orders WHERE code = ?").get(code);
    if (!exists) return code;
  }
}

async function createPendingOrder({ userId, kind, giftId, recipientId, amountRub, meta }) {
  const order = {
    id: genId("po"),
    code: generateOrderCode(),
    userId,
    kind,
    giftId: giftId ?? null,
    recipientId: recipientId ?? null,
    amountRub,
    meta: meta ? JSON.stringify(meta) : null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO pending_orders (id, code, userId, kind, giftId, recipientId, amountRub, meta, status, createdAt)
     VALUES (@id, @code, @userId, @kind, @giftId, @recipientId, @amountRub, @meta, @status, @createdAt)`
  ).run(order);
  return { ...order, meta: meta ?? null };
}

async function getPendingOrderByCode(code) {
  return rowToOrder(db.prepare("SELECT * FROM pending_orders WHERE code = ?").get(code));
}

async function markOrderFulfilled(id) {
  db.prepare("UPDATE pending_orders SET status = 'fulfilled' WHERE id = ?").run(id);
}

module.exports = { createPendingOrder, getPendingOrderByCode, markOrderFulfilled, CODE_RE };
