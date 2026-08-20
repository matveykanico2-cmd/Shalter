const db = require("../db");

// Каталог меток безопасности (таблица в server/db.js). Читается всеми — значок
// рядом с именем видит каждый, а не только администратор, — а меняется только
// администратором (server/routes/admin.js).
function listLabels() {
  return db.prepare("SELECT * FROM safety_labels ORDER BY createdAt ASC").all();
}

function getLabel(id) {
  return db.prepare("SELECT * FROM safety_labels WHERE id = ?").get(id);
}

// Идентификатор метки хранится в строке пользователя, поэтому он должен быть
// пригоден для сравнения и не меняться: латиница, цифры, подчёркивание.
function normalizeId(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

function createLabel({ id, short, label, hint, color }) {
  // Идентификатор собирается из латиницы, а надпись на метке обычно русская —
  // «СПАМ» превращалось в пустую строку, и создание молча отказывало. Если
  // собирать не из чего, выдаём свой: он служебный, человек его нигде не видит.
  const wanted = normalizeId(id || short);
  const row = {
    id: wanted || `label_${Date.now().toString(36)}`,
    short: String(short ?? "").trim().slice(0, 16).toUpperCase(),
    label: String(label ?? "").trim().slice(0, 60),
    hint: String(hint ?? "").trim().slice(0, 300),
    color: String(color ?? "#c6403b").trim().slice(0, 24),
    createdAt: new Date().toISOString(),
  };
  if (!row.id || !row.short || !row.label) return { error: "Нужны идентификатор, короткая надпись и название" };
  if (getLabel(row.id)) return { error: "Метка с таким идентификатором уже есть" };
  db.prepare(
    "INSERT INTO safety_labels (id, short, label, hint, color, createdAt) VALUES (@id, @short, @label, @hint, @color, @createdAt)"
  ).run(row);
  return { label: row };
}

// Удаление метки снимает её со всех, кому она была поставлена: иначе у людей
// остаётся значок, о котором больше никто ничего не знает.
function deleteLabel(id) {
  db.prepare("UPDATE users SET safetyLabel = NULL, safetyLabelAt = NULL WHERE safetyLabel = ?").run(id);
  db.prepare("DELETE FROM safety_labels WHERE id = ?").run(id);
}

module.exports = { listLabels, getLabel, createLabel, deleteLabel };
