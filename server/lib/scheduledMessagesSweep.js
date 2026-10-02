const { getChat } = require("../data/chats");
const { listDue, deleteScheduled } = require("../data/scheduledMessages");

const SWEEP_INTERVAL_MS = 20_000;

async function sweepOnce() {
  const due = listDue(new Date().toISOString());
  if (!due.length) return;
  const { deliverMessage } = require("../routes/messages");

  for (const scheduled of due) {
    try {
      const chat = await getChat(scheduled.chatId);
      if (chat && chat.memberIds.includes(scheduled.senderId)) {
        await deliverMessage(chat, scheduled.senderId, {
          text: scheduled.text,
          attachments: scheduled.attachments,
          replyToId: scheduled.replyToId,
        });
      }
    } catch (err) {
      console.error(`scheduled message ${scheduled.id} failed to send:`, err);
    } finally {
      await deleteScheduled(scheduled.id);
    }
  }
}

function startScheduledMessagesSweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("scheduled-messages sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { startScheduledMessagesSweep, sweepOnce };
