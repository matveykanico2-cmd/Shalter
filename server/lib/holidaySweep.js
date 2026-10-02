const db = require("../db");
const { listUsers } = require("../data/users");
const { getSettings } = require("../data/settings");
const { BUILTIN_HOLIDAYS } = require("./holidays");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { sendPushToUser, MESSAGE_PUSH } = require("../push");

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function todayMonthDay() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function alreadySent(userId, holidayId, year) {
  return !!db
    .prepare("SELECT 1 FROM holiday_notifications_sent WHERE userId = ? AND holidayId = ? AND year = ?")
    .get(userId, holidayId, year);
}

function markSent(userId, holidayId, year) {
  db.prepare(
    "INSERT OR IGNORE INTO holiday_notifications_sent (userId, holidayId, year, sentAt) VALUES (?, ?, ?, ?)"
  ).run(userId, holidayId, year, new Date().toISOString());
}

async function sweepOnce() {
  const today = todayMonthDay();
  const year = new Date().getFullYear();
  const users = await listUsers();

  for (const user of users) {
    if (user.isBot) continue;
    const settings = await getSettings(user.id);
    const holidays = settings.holidays ?? { disabled: [], custom: [] };
    const disabled = new Set(holidays.disabled ?? []);
    const todaysHolidays = [...BUILTIN_HOLIDAYS, ...(holidays.custom ?? [])].filter(
      (h) => h.date === today && !disabled.has(h.id)
    );

    for (const holiday of todaysHolidays) {
      if (alreadySent(user.id, holiday.id, year)) continue;
      try {
        const chat = await findOrCreateDm(SYSTEM_BOT_ID, user.id);
        await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `🎉 Сегодня ${holiday.title}! Поздравляем.`);
        sendPushToUser(
          user.id,
          { title: `🎉 ${holiday.title}`, body: "Праздничное напоминание", url: `/chat/${chat.id}`, tag: `holiday-${holiday.id}-${year}` },
          MESSAGE_PUSH
        ).catch(() => {});
      } catch (err) {
        console.error(`holiday notification failed (user ${user.id}, holiday ${holiday.id}):`, err);
      } finally {
        markSent(user.id, holiday.id, year);
      }
    }
  }
}

function startHolidaySweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("holiday sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
  sweepOnce().catch((err) => console.error("holiday sweep failed:", err));
}

module.exports = { startHolidaySweep, sweepOnce };
