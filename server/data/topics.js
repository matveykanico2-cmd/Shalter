// Темы (топики) в группах, как форумы в Telegram: у сообщения есть topicId,
// сообщения без него — тема «Общее», которая есть всегда и не удаляется.
const db = require("../db");
const { genId } = require("../lib/genId");

const MAX_TOPICS = 100;
const COLORS = ["#6fb9f0", "#ffd67e", "#cb86db", "#8eee98", "#ff93b2", "#fb6f5f"];

function rowToTopic(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    title: row.title,
    icon: row.icon ?? undefined,
    color: row.color ?? COLORS[0],
    closed: !!row.closed,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function listTopics(chatId) {
  const rows = db.prepare("SELECT * FROM chat_topics WHERE chatId = ? ORDER BY createdAt ASC").all(chatId);
  const last = db.prepare(
    "SELECT topicId, MAX(createdAt) AS lastAt, COUNT(*) AS n FROM messages WHERE chatId = ? AND topicId IS NOT NULL AND threadRootId IS NULL GROUP BY topicId"
  );
  const stats = new Map(last.all(chatId).map((r) => [r.topicId, r]));
  return rows.map((row) => {
    const t = rowToTopic(row);
    const s = stats.get(t.id);
    return { ...t, messageCount: s?.n ?? 0, lastMessageAt: s?.lastAt ?? t.createdAt };
  });
}

function getTopic(id) {
  return rowToTopic(db.prepare("SELECT * FROM chat_topics WHERE id = ?").get(id));
}

function countTopics(chatId) {
  return db.prepare("SELECT COUNT(*) AS n FROM chat_topics WHERE chatId = ?").get(chatId).n;
}

function createTopic(chatId, { title, icon, color }, createdBy) {
  const topic = {
    id: genId("topic"),
    chatId,
    title,
    icon: icon ?? null,
    color: COLORS.includes(color) ? color : COLORS[countTopics(chatId) % COLORS.length],
    closed: 0,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO chat_topics (id, chatId, title, icon, color, closed, createdBy, createdAt) VALUES (@id, @chatId, @title, @icon, @color, @closed, @createdBy, @createdAt)"
  ).run(topic);
  return getTopic(topic.id);
}

function updateTopic(id, patch) {
  const current = getTopic(id);
  if (!current) return undefined;
  const next = {
    title: patch.title ?? current.title,
    icon: patch.icon === undefined ? current.icon ?? null : patch.icon || null,
    color: COLORS.includes(patch.color) ? patch.color : current.color,
    closed: patch.closed === undefined ? (current.closed ? 1 : 0) : patch.closed ? 1 : 0,
  };
  db.prepare("UPDATE chat_topics SET title = @title, icon = @icon, color = @color, closed = @closed WHERE id = @id").run({ ...next, id });
  return getTopic(id);
}

// Удаление темы удаляет и её сообщения — как в Telegram.
const deleteTopic = db.transaction((id) => {
  const ids = db.prepare("SELECT id FROM messages WHERE topicId = ?").all(id).map((r) => r.id);
  db.prepare("DELETE FROM messages WHERE topicId = ?").run(id);
  db.prepare("DELETE FROM chat_topics WHERE id = ?").run(id);
  return ids;
});

module.exports = { MAX_TOPICS, COLORS, listTopics, getTopic, countTopics, createTopic, updateTopic, deleteTopic };
