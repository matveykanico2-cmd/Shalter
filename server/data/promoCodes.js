const crypto = require("crypto");
const db = require("../db");

const CODE_LENGTH = 8;

const VALID_PRIZES = new Set(["premium", "stars", "ads", "business"]);

function parseConfig(raw) {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (!c || typeof c.type !== "string" || !VALID_PRIZES.has(c.type)) return null;
    return c;
  } catch {
    return null;
  }
}

function rowToPromo(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    code: row.code,
    prize: row.prize,
    config: parseConfig(row.config),
    usesTotal: row.usesTotal ?? null,
    used: row.used ?? 0,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function generateCode() {
  return crypto.randomBytes(6).toString("base64url").slice(0, CODE_LENGTH).toUpperCase();
}

function create({ code, prize, config, usesTotal, createdBy }) {
  const finalCode = code || generateCode();
  const finalUsesTotal = usesTotal === undefined || usesTotal === null ? null : Math.max(1, Math.floor(Number(usesTotal)) || 1);
  db.prepare(
    `INSERT INTO promo_codes (id, code, prize, config, usesTotal, used, createdBy, createdAt)
     VALUES (@id, @code, @prize, @config, @usesTotal, 0, @createdBy, @createdAt)`
  ).run({
    id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    code: finalCode.toUpperCase(),
    prize,
    config: JSON.stringify(config),
    usesTotal: finalUsesTotal,
    createdBy,
    createdAt: new Date().toISOString(),
  });
  return getByCode(finalCode);
}

function getByCode(code) {
  return rowToPromo(db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(code.toUpperCase?.() ?? code));
}

function getById(id) {
  return rowToPromo(db.prepare("SELECT * FROM promo_codes WHERE id = ?").get(id));
}

function list() {
  return db.prepare("SELECT * FROM promo_codes ORDER BY createdAt DESC").all().map(rowToPromo);
}

function updateRedemptions(codeId, userId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO promo_code_redemptions (codeId, userId, redeemedAt) VALUES (?, ?, ?)`
  ).run(codeId, userId, now);
}

const redeem = db.transaction((code, userId) => {
  const row = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(code.toUpperCase?.() ?? code);
  if (!row) return { error: "Код не найден" };

  const config = parseConfig(row.config);
  if (!config) return { error: "Ошибка конфигурации кода" };

  const existing = db
    .prepare("SELECT 1 FROM promo_code_redemptions WHERE codeId = ? AND userId = ?")
    .get(row.id, userId);
  if (existing) return { error: "Вы уже активировали этот код" };

  if (row.usesTotal !== null && row.used >= row.usesTotal) return { error: "Код уже использован" };

  db.prepare("UPDATE promo_codes SET used = used + 1 WHERE id = ?").run(row.id);
  db.prepare(
    "INSERT INTO promo_code_redemptions (codeId, userId, redeemedAt) VALUES (?, ?, ?)"
  ).run(row.id, userId, new Date().toISOString());

  return { promo: rowToPromo(row), config };
});

function deleteCode(id) {
  db.prepare("DELETE FROM promo_codes WHERE id = ?").run(id);
}

function setUsesTotal(id, usesTotal) {
  db.prepare("UPDATE promo_codes SET usesTotal = ? WHERE id = ?").run(usesTotal, id);
}

module.exports = {
  VALID_PRIZES,
  generateCode,
  create,
  getByCode,
  getById,
  list,
  redeem,
  deleteCode,
  setUsesTotal,
};
