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
    // Как у обычных сообщений: отправитель уже «прочитал» своё. Иначе после просмотра
    // собеседником readByIds = [он один], и у отправителя навсегда одна галочка.
    readByIds: [senderId],
    ...extra,
  });
  broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message });
  return message;
}

// Служебная строка в ленте («Иван закрепил(а) …»). build(name) возвращает текст
// или null, если объявлять нечего. Ошибка не роняет основное действие.
async function serviceLine(chat, actorId, build) {
  try {
    const { getUser } = require("../data/users");
    const { SYSTEM_BOT_ID } = require("../data/systemBot");
    const actor = actorId ? await getUser(actorId) : null;
    const text = build(actor?.name ?? "Кто-то");
    if (text) return await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, { type: "system" });
  } catch (err) {
    console.error("service line failed:", err);
  }
  return null;
}

module.exports = { findOrCreateDm, sendMessageAndBroadcast, serviceLine };
