// Shared by both ways a bot can reply: the external Bot API's POST
// /sendMessage (server/routes/botApi.js) and the in-app sandboxed code
// (server/lib/botSandbox.js) — same operation either way, just a different
// caller.
const { getChat } = require("../data/chats");
const { addMessage } = require("../data/messages");
const { broadcastToUsers } = require("../ws");

async function sendBotMessage(botUserId, chatId, text, { keyboard, replyToId } = {}) {
  if (!text?.trim()) throw new Error("text is required");

  const chat = await getChat(chatId);
  if (!chat || !chat.memberIds.includes(botUserId)) {
    throw new Error("Bot is not a member of this chat");
  }

  const message = await addMessage({
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    chatId,
    senderId: botUserId,
    type: "text",
    text,
    createdAt: new Date().toISOString(),
    replyToId: replyToId ?? null,
    keyboard: Array.isArray(keyboard) ? keyboard : undefined,
    readByIds: [],
  });
  broadcastToUsers(chat.memberIds, { type: "message:new", chatId, message });
  return message;
}

module.exports = { sendBotMessage };
