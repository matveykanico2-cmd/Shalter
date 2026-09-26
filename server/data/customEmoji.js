const db = require("../db");
const { sanitizeScene } = require("../lib/sanitizeScene");

// Кастомные эмодзи пользователя — маленькие анимированные сцены (аниматор,
// public/js/lib/customScene.js), которые вставляются прямо в текст сообщения.
//
// Сцена — пользовательский контент, уходящий в чужие чаты, поэтому её форма
// пинуется здесь через sanitizeScene, ровно как у стикеров пака
// (data/stickerPacks.js). Пустая сцена (без фигур) недопустима.

const MAX_EMOJI = 100;
const MAX_NAME = 40;

function rowToEmoji(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    scene: JSON.parse(row.scene),
    createdAt: row.createdAt,
  };
}

function listEmojiFor(ownerId) {
  return db
    .prepare("SELECT * FROM custom_emoji WHERE ownerId = ? ORDER BY createdAt DESC")
    .all(ownerId)
    .map(rowToEmoji);
}

function countFor(ownerId) {
  return db.prepare("SELECT COUNT(*) c FROM custom_emoji WHERE ownerId = ?").get(ownerId).c;
}

function getEmoji(id) {
  return rowToEmoji(db.prepare("SELECT * FROM custom_emoji WHERE id = ?").get(id));
}

// Возвращает { emoji } или { error } — так вызывающий маршрут отвечает нужным
// кодом, не заглядывая внутрь правил.
function createEmoji({ ownerId, name, scene }) {
  const clean = sanitizeScene(scene, { requireLayers: true });
  if (!clean) return { error: "Нарисуйте эмодзи — добавьте хотя бы одну фигуру" };
  if (countFor(ownerId) >= MAX_EMOJI) return { error: `Не больше ${MAX_EMOJI} своих эмодзи` };
  const row = {
    id: `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    name: String(name ?? "").trim().slice(0, MAX_NAME),
    scene: JSON.stringify(clean),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO custom_emoji (id, ownerId, name, scene, createdAt) VALUES (@id, @ownerId, @name, @scene, @createdAt)"
  ).run(row);
  return { emoji: getEmoji(row.id) };
}

function deleteEmoji(id, ownerId) {
  return db.prepare("DELETE FROM custom_emoji WHERE id = ? AND ownerId = ?").run(id, ownerId).changes > 0;
}

module.exports = { listEmojiFor, getEmoji, createEmoji, deleteEmoji, MAX_EMOJI };
