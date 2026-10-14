const db = require("../db");

// День считаем по Москве: лимиты обнуляются в полночь по МСК, а не по UTC.
function today() {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

function getAiUsage(userId) {
  const row = db.prepare("SELECT texts, images FROM ai_usage WHERE userId = ? AND day = ?").get(userId, today());
  return { texts: row?.texts ?? 0, images: row?.images ?? 0 };
}

function addAiUsage(userId, kind) {
  const col = kind === "image" ? "images" : "texts";
  db.prepare(
    `INSERT INTO ai_usage (userId, day, ${col}) VALUES (?, ?, 1)
     ON CONFLICT(userId, day) DO UPDATE SET ${col} = ${col} + 1`
  ).run(userId, today());
  // Старые дни не нужны — чистим изредка, чтобы таблица не росла.
  if (Math.random() < 0.01) db.prepare("DELETE FROM ai_usage WHERE day < ?").run(new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
}

module.exports = { getAiUsage, addAiUsage };
