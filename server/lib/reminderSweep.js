const { getChat } = require("../data/chats");
const { listDueReminders, markReminderSent } = require("../data/reminders");
const { sendMessageAndBroadcast } = require("./systemChat");
const { HELPER_BOT_ID } = require("../data/helperBot");

const SWEEP_INTERVAL_MS = 20_000;

async function sweepOnce() {
  const due = listDueReminders(new Date().toISOString());
  if (!due.length) return;

  for (const reminder of due) {
    try {
      const chat = await getChat(reminder.chatId);
      if (chat && chat.memberIds.includes(reminder.userId)) {
        await sendMessageAndBroadcast(chat, HELPER_BOT_ID, `⏰ Напоминание: ${reminder.text}`);
      }
    } catch (err) {
      console.error(`reminder ${reminder.id} failed to deliver:`, err);
    } finally {
      markReminderSent(reminder.id);
    }
  }
}

function startReminderSweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("reminder sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { startReminderSweep, sweepOnce };
