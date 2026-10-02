const { findDmBetween, createChat } = require("../data/chats");
const { genId } = require("./genId");
const { addMessage } = require("../data/messages");
const { broadcastToUsers } = require("../ws");

async function findOrCreateDm(userIdA, userIdB) {
  const existing = await findDmBetween(userIdA, userIdB);
  if (existing) return existing;
  return createChat({
    id: genId("c"),
    type: "dm",
    title: "",
    memberIds: [...new Set([userIdA, userIdB])],
    pinned: false,
    muted: false,
    archived: false,
    createdAt: new Date().toISOString(),
  });
}

async function sendMessageAndBroadcast(chat, senderId, text, extra = {}) {
  const message = await addMessage({
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    chatId: chat.id,
    senderId,
    type: "text",
    text,
    createdAt: new Date().toISOString(),
    ...extra,
  });
  broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message });
  return message;
}

module.exports = { findOrCreateDm, sendMessageAndBroadcast };
