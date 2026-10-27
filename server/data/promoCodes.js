const crypto = require("crypto");
const db = require("../db");

const PRIZES = ["premium", "stars", "ads", "business"];
// Без 0/O и 1/I — код диктуют и переписывают руками.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function parseConfig(raw) {
  try {
    const c = JSON.parse(raw);
    return c && PRIZES.includes(c.type) ? c : null;
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
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function getByCode(code) {
  return rowToPromo(db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(String(code).toUpperCase()));
}

function getById(id) {
  return rowToPromo(db.prepare("SELECT * FROM promo_codes WHERE id = ?").get(id));
}

function list() {
  return db.prepare("SELECT * FROM promo_codes ORDER BY createdAt DESC").all().map(rowToPromo);
}

// undefined — код уже занят.
function create({ code, prize, config, usesTotal, createdBy }) {
  const finalCode = (code || generateCode()).toUpperCase();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO promo_codes (id, code, prize, config, usesTotal, used, createdBy, createdAt)
       VALUES (@id, @code, @prize, @config, @usesTotal, 0, @createdBy, @createdAt)`
    )
    .run({
      id: `pc_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      code: finalCode,
      prize,
      config: JSON.stringify(config),
      usesTotal: usesTotal ?? null,
      createdBy,
      createdAt: new Date().toISOString(),
    });
  return info.changes ? getByCode(finalCode) : undefined;
}

// Проверка и учёт активации — одной транзакцией, чтобы два параллельных запроса
// не провели последнюю активацию дважды.
const redeem = db.transaction((code, userId) => {
  const row = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(String(code).toUpperCase());
  if (!row) return { error: "Код не найден" };
  const config = parseConfig(row.config);
  if (!config) return { error: "Ошибка конфигурации кода" };
  if (db.prepare("SELECT 1 FROM promo_code_redemptions WHERE codeId = ? AND userId = ?").get(row.id, userId)) {
    return { error: "Вы уже активировали этот код" };
  }
  if (row.usesTotal !== null && row.used >= row.usesTotal) return { error: "Код уже использован" };
  db.prepare("UPDATE promo_codes SET used = used + 1 WHERE id = ?").run(row.id);
  db.prepare("INSERT INTO promo_code_redemptions (codeId, userId, redeemedAt) VALUES (?, ?, ?)").run(
    row.id,
    userId,
    new Date().toISOString()
  );
  return { promo: rowToPromo(row), config };
});

function deleteCode(id) {
  db.prepare("DELETE FROM promo_codes WHERE id = ?").run(id);
}

function setUsesTotal(id, usesTotal) {
  db.prepare("UPDATE promo_codes SET usesTotal = ? WHERE id = ?").run(usesTotal, id);
}

module.exports = { PRIZES, generateCode, create, getByCode, getById, list, redeem, deleteCode, setUsesTotal };
