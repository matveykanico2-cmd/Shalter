const { getChat } = require("../data/chats");
const { listDue, deleteScheduled, reschedule, nextOccurrence } = require("../data/scheduledMessages");

const SWEEP_INTERVAL_MS = 20_000;

async function sweepOnce() {
  const due = listDue(new Date().toISOString());
  if (!due.length) return;
  const { deliverMessage, sendGate } = require("../routes/messages");

  for (const scheduled of due) {
    let gone = false;
    try {
      const chat = await getChat(scheduled.chatId);
      const body = { text: scheduled.text, attachments: scheduled.attachments, replyToId: scheduled.replyToId, topicId: scheduled.topicId };
      if (chat && chat.memberIds.includes(scheduled.senderId)) {
        // Права могли измениться с момента планирования (сняли админку, заблокировали).
        const gate = await sendGate(chat, scheduled.senderId, body, { skipSlowMode: true });
        if (gate.status) console.warn(`scheduled message ${scheduled.id} dropped: ${gate.payload?.error}`);
        else await deliverMessage(chat, scheduled.senderId, body, { paidStars: gate.charged });
      } else {
        gone = true;
      }
    } catch (err) {
      console.error(`scheduled message ${scheduled.id} failed to send:`, err);
    } finally {
      const next = scheduled.repeat && !gone ? nextOccurrence(scheduled.sendAt, scheduled.repeat) : null;
      if (next) reschedule(scheduled.id, next);
      else await deleteScheduled(scheduled.id);
    }
  }
}

function startScheduledMessagesSweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("scheduled-messages sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { startScheduledMessagesSweep, sweepOnce };
