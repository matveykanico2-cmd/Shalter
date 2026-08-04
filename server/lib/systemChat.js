// Shared "find-or-create a DM and drop an automated message in it" helper —
// used for the referral bonus notice, the Premium purchase/grant flow, and
// the Shalter service chat (login codes, new-device alerts). All of those
// are the same shape: two users, an existing-or-new DM between them, one
// system-authored message broadcast over WS.
const { listChats, createChat } = require("../data/chats");
const { addMessage } = require("../data/messages");
const { broadcastToUsers } = require("../ws");

async function findOrCreateDm(userIdA, userIdB) {
  const existing = (await listChats()).find(
    (c) => c.type === "dm" && c.memberIds.includes(userIdA) && c.memberIds.includes(userIdB)
  );
  if (existing) return existing;
  return createChat({
    id: `c_${Date.now()}`,
    type: "dm",
    title: "",
    memberIds: [userIdA, userIdB],
    pinned: false,
    muted: false,
    archived: false,
    createdAt: new Date().toISOString(),
  });
}

async function sendMessageAndBroadcast(chat, senderId, text) {
  const message = await addMessage({
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    chatId: chat.id,
    senderId,
    type: "text",
    text,
    createdAt: new Date().toISOString(),
  });
  broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message });
  return message;
}

module.exports = { findOrCreateDm, sendMessageAndBroadcast };
