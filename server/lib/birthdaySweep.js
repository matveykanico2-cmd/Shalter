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
        markSent(ownerId, person.id, year);
      }
    }
  }
}

function startBirthdaySweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("birthday sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
  sweepOnce().catch((err) => console.error("birthday sweep failed:", err));
}

module.exports = { startBirthdaySweep, sweepOnce };
