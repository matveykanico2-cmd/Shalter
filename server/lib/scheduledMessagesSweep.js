// Scheduled-message sweep — same plain-setInterval-scan shape as
// autoDelete.js's sweep, for the same reason: a setTimeout per scheduled
// message wouldn't survive a server restart, and a periodic scan is simpler
// and self-healing (a message scheduled for while the server happened to be
// down just fires on the next tick after it comes back, instead of being
// lost).
const { getChat } = require("../data/chats");
const { listDue, deleteScheduled } = require("../data/scheduledMessages");

const SWEEP_INTERVAL_MS = 20_000;

async function sweepOnce() {
  const due = listDue(new Date().toISOString());
  if (!due.length) return;
  // Required late (not at module load) — routes/messages.js requires this
  // module's own directory indirectly (server/index.js mounts both), and
  // requiring it at the top would risk a require() cycle depending on load
  // order; deliverMessage is only ever called once a sweep actually finds
  // something due, so a lazy require here is free.
  const { deliverMessage } = require("../routes/messages");

  for (const scheduled of due) {
    try {
      const chat = await getChat(scheduled.chatId);
      // The chat got deleted, or the sender left it, since this was queued
      // — silently drop rather than deliver into a chat they're not in.
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
