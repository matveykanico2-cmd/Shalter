// Shared "find-or-create a DM and drop an automated message in it" helper —
// used for the referral bonus notice, the Premium purchase/grant flow, and
// the Shalter service chat (login codes, new-device alerts). All of those
// are the same shape: two users, an existing-or-new DM between them, one
// system-authored message broadcast over WS.
const { findDmBetween, createChat } = require("../data/chats");
const { addMessage } = require("../data/messages");
const { broadcastToUsers } = require("../ws");

async function findOrCreateDm(userIdA, userIdB) {
  // Поиск идёт запросом по join-таблице (data/chats.js), а не перебором всех
  // чатов сервера в памяти, как было: перебор читал каждый чат вместе с его
  // участниками ради одного диалога и дорожал с каждым чатом в базе.
  const existing = await findDmBetween(userIdA, userIdB);
  if (existing) return existing;
  // Deduped: the admin self-delivering a gift/Premium to themselves (see
  // routes/gifts.js, routes/premium.js) calls this with userIdA === userIdB
  // — chat_members has a (chatId, userId) primary key, so a literal
  // [id, id] would crash the insert with a constraint violation.
  return createChat({
    id: `c_${Date.now()}`,
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
