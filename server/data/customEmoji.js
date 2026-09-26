const db = require("../db");
const { sanitizeScene } = require("../lib/sanitizeScene");

// Кастомные эмодзи — общий каталог, как подарки: создаёт/правит/удаляет только
// админ (см. server/routes/customEmoji.js), а вставлять их в сообщения может
// кто угодно. Раньше это была личная библиотека каждого пользователя; теперь
// набор один на всех, поэтому список — глобальный, а не по владельцу.
//
// Сцена — пользовательский (админский) контент, уходящий в чужие чаты, поэтому
// её форма пинуется через sanitizeScene. `ownerId` остаётся как автор записи
// (кто из админов её создал) — для истории, не для доступа.

const MAX_EMOJI = 500;
const MAX_NAME = 40;

function rowToEmoji(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    scene: JSON.parse(row.scene),
    createdAt: row.createdAt,
  };
}

// Весь каталог — для пикера у любого пользователя.
function listAllEmoji() {
  return db.prepare("SELECT * FROM custom_emoji ORDER BY createdAt DESC").all().map(rowToEmoji);
}

function countAll() {
  return db.prepare("SELECT COUNT(*) c FROM custom_emoji").get().c;
}

function getEmoji(id) {
  return rowToEmoji(db.prepare("SELECT * FROM custom_emoji WHERE id = ?").get(id));
}

// Создание — только админом (гейт в маршруте). Возвращает { emoji } или { error }.
function createEmoji({ creatorId, name, scene }) {
  const clean = sanitizeScene(scene, { requireLayers: true });
  if (!clean) return { error: "Нарисуйте эмодзи — добавьте хотя бы одну фигуру" };
  if (countAll() >= MAX_EMOJI) return { error: `Не больше ${MAX_EMOJI} эмодзи в каталоге` };
  const row = {
    id: `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId: creatorId ?? "",
    name: String(name ?? "").trim().slice(0, MAX_NAME),
    scene: JSON.stringify(clean),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO custom_emoji (id, ownerId, name, scene, createdAt) VALUES (@id, @ownerId, @name, @scene, @createdAt)"
  ).run(row);
  return { emoji: getEmoji(row.id) };
}

// Правка любого эмодзи каталога (админом). Возвращает { emoji } / { notFound } / { error }.
function updateEmoji(id, { name, scene }) {
  const existing = db.prepare("SELECT * FROM custom_emoji WHERE id = ?").get(id);
  if (!existing) return { notFound: true };
  let sceneJson = existing.scene;
  if (scene !== undefined) {
    const clean = sanitizeScene(scene, { requireLayers: true });
    if (!clean) return { error: "Нарисуйте эмодзи — добавьте хотя бы одну фигуру" };
    sceneJson = JSON.stringify(clean);
  }
  db.prepare("UPDATE custom_emoji SET name = ?, scene = ? WHERE id = ?").run(
    name === undefined ? existing.name : String(name).trim().slice(0, MAX_NAME),
    sceneJson,
    id
  );
  return { emoji: getEmoji(id) };
}

function deleteEmoji(id) {
  return db.prepare("DELETE FROM custom_emoji WHERE id = ?").run(id).changes > 0;
}

module.exports = { listAllEmoji, getEmoji, createEmoji, updateEmoji, deleteEmoji, MAX_EMOJI };
