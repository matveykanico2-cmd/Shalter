const db = require("../db");
const { encryptText, decryptText } = require("../lib/textCrypto");

// Текст зашифрован тем же ключом, что и сообщения (lib/textCrypto.js).
const aad = (id) => `sched:${id}`;

// Повтор отложенного, как в Telegram: после отправки сообщение не удаляется,
// а переносится на следующий срок.
const REPEATS = ["day", "week", "2weeks", "month", "3months", "6months", "year"];

const DAY_STEPS = { day: 1, week: 7, "2weeks": 14 };
const MONTH_STEPS = { month: 1, "3months": 3, "6months": 6, year: 12 };

// Месяцы считаем от исходной даты с подрезкой до конца месяца: 31 января →
// 28 февраля → 31 марта, а не 3 марта → 3 апреля.
function addMonthsClamped(base, months) {
  const d = new Date(base);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

function nextOccurrence(iso, repeat, nowIso = new Date().toISOString()) {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  for (let k = 1; k < 100_000; k++) {
    let d;
    if (DAY_STEPS[repeat]) d = new Date(base.getTime() + k * DAY_STEPS[repeat] * 86400_000);
    else if (MONTH_STEPS[repeat]) d = addMonthsClamped(base, k * MONTH_STEPS[repeat]);
    else return null;
    if (d.toISOString() > nowIso) return d.toISOString();
  }
  return null;
}

function rowToScheduled(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    text: decryptText(aad(row.id), row.text),
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    replyToId: row.replyToId ?? null,
    topicId: row.topicId ?? null,
    repeat: row.repeat ?? null,
    sendAt: row.sendAt,
    createdAt: row.createdAt,
  };
}

async function listScheduledFor(chatId, senderId) {
  return db
    .prepare("SELECT * FROM scheduled_messages WHERE chatId = ? AND senderId = ? ORDER BY sendAt ASC")
    .all(chatId, senderId)
    .map(rowToScheduled);
}

async function getScheduled(id) {
  return rowToScheduled(db.prepare("SELECT * FROM scheduled_messages WHERE id = ?").get(id));
}

async function addScheduled(msg) {
  db.prepare(
    `INSERT INTO scheduled_messages (id, chatId, senderId, text, attachments, replyToId, topicId, repeat, sendAt, createdAt)
     VALUES (@id, @chatId, @senderId, @text, @attachments, @replyToId, @topicId, @repeat, @sendAt, @createdAt)`
  ).run({
    id: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    text: encryptText(aad(msg.id), msg.text ?? ""),
    attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
    replyToId: msg.replyToId ?? null,
    topicId: msg.topicId ?? null,
    repeat: REPEATS.includes(msg.repeat) ? msg.repeat : null,
    sendAt: msg.sendAt,
    createdAt: msg.createdAt,
  });
  return getScheduled(msg.id);
}

async function editScheduled(id, patch) {
  const existing = await getScheduled(id);
  if (!existing) return undefined;
  const repeat = patch.repeat === undefined ? existing.repeat : REPEATS.includes(patch.repeat) ? patch.repeat : null;
  db.prepare("UPDATE scheduled_messages SET text = ?, sendAt = ?, repeat = ? WHERE id = ?").run(
    encryptText(aad(id), patch.text ?? existing.text),
    patch.sendAt ?? existing.sendAt,
    repeat,
    id
  );
  return getScheduled(id);
}

async function deleteScheduled(id) {
  db.prepare("DELETE FROM scheduled_messages WHERE id = ?").run(id);
}

function reschedule(id, sendAt) {
  db.prepare("UPDATE scheduled_messages SET sendAt = ? WHERE id = ?").run(sendAt, id);
}

function listDue(nowIso) {
  return db.prepare("SELECT * FROM scheduled_messages WHERE sendAt <= ?").all(nowIso).map(rowToScheduled);
}

module.exports = { REPEATS, nextOccurrence, listScheduledFor, getScheduled, addScheduled, editScheduled, deleteScheduled, reschedule, listDue };
