// Birthday reminders — once a day, look at who has a birthday today (month
// + day, year ignored) and tell everyone who has them as a contact, with a
// nudge to send a gift. Same plain-setInterval-scan shape as
// scheduledMessagesSweep.js/autoDelete.js: simpler than a timer per
// birthday, and self-healing across restarts (a birthday the server was
// down for still gets noticed on the next tick that day).
//
// Checked every hour, not once at midnight — a single fixed-time timer
// wouldn't survive a restart landing on the wrong side of it, and an hourly
// scan costs one cheap query when there's nothing to do (see
// listUsersWithBirthdayToday's SQL).
const db = require("../db");
const { listUsersWithBirthdayToday, getUser } = require("../data/users");
const { listOwnersOf } = require("../data/contacts");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { sendPushToUser, MESSAGE_PUSH } = require("../push");

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function alreadySent(ownerId, birthdayUserId, year) {
  return !!db
    .prepare("SELECT 1 FROM birthday_greetings_sent WHERE ownerId = ? AND birthdayUserId = ? AND year = ?")
    .get(ownerId, birthdayUserId, year);
}

function markSent(ownerId, birthdayUserId, year) {
  db.prepare(
    "INSERT OR IGNORE INTO birthday_greetings_sent (ownerId, birthdayUserId, year, sentAt) VALUES (?, ?, ?, ?)"
  ).run(ownerId, birthdayUserId, year, new Date().toISOString());
}

async function sweepOnce() {
  const birthdayUsers = listUsersWithBirthdayToday();
  if (!birthdayUsers.length) return;
  const year = new Date().getFullYear();

  for (const person of birthdayUsers) {
    const ownerIds = listOwnersOf(person.id).filter((id) => id !== person.id);
    for (const ownerId of ownerIds) {
      if (alreadySent(ownerId, person.id, year)) continue;
      try {
        const chat = await findOrCreateDm(SYSTEM_BOT_ID, ownerId);
        await sendMessageAndBroadcast(
          chat,
          SYSTEM_BOT_ID,
          `🎂 Сегодня день рождения у ${person.name}! Поздравьте и, если хотите — подарите подарок.`,
          { attachments: [{ kind: "birthday", meta: { userId: person.id, name: person.name, avatarImage: person.avatarImage || null } }] }
        );
        sendPushToUser(
          ownerId,
          { title: "Сегодня день рождения 🎂", body: `У ${person.name} день рождения — загляните в чат`, url: `/chat/${chat.id}`, tag: `birthday-${person.id}-${year}` },
          MESSAGE_PUSH
        ).catch(() => {});
      } catch (err) {
        console.error(`birthday greeting failed (owner ${ownerId}, birthday person ${person.id}):`, err);
      } finally {
        // Помечается даже при сбое отправки — иначе одна ошибка (например,
        // временный сбой пуша) заставляла бы пытаться заново каждый час до
        // конца дня. Сам чат — источник правды о том, видел ли человек
        // поздравление; эта таблица — только "пытались ли мы вообще".
        markSent(ownerId, person.id, year);
      }
    }
  }
}

function startBirthdaySweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("birthday sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
  // Раз при старте тоже — не ждать первого часа, чтобы 9 утра в день чьего-то
  // рождения не превращалось в "поздравим ближе к вечеру".
  sweepOnce().catch((err) => console.error("birthday sweep failed:", err));
}

module.exports = { startBirthdaySweep, sweepOnce };
