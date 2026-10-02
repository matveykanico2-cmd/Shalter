const { listChats } = require("../data/chats");
const { deleteExpiredMessages } = require("../data/messages");
const { broadcastToUsers } = require("../ws");

const SWEEP_INTERVAL_MS = 60_000;

async function sweepOnce() {
  const chats = await listChats();
  for (const chat of chats) {
    if (!chat.autoDeleteSeconds) continue;
    const cutoff = new Date(Date.now() - chat.autoDeleteSeconds * 1000).toISOString();
    const deletedIds = deleteExpiredMessages(chat.id, cutoff);
    for (const id of deletedIds) {
      broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id });
    }
  }
}

function startAutoDeleteSweep() {
  setInterval(() => {
    sweepOnce().catch((err) => console.error("auto-delete sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { startAutoDeleteSweep, sweepOnce };
