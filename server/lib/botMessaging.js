const { getChat } = require("../data/chats");
const { addMessage } = require("../data/messages");
const { broadcastToUsers } = require("../ws");

function normalizeKeyboard(keyboard) {
  if (!Array.isArray(keyboard)) return undefined;
  const rows = keyboard
    .filter(Array.isArray)
    .map((row) =>
      row
        .map((btn) => {
          const text = String(btn?.text ?? "").trim().slice(0, 64);
          if (!text) return null;
          if (btn?.app) return { text, app: String(btn.app) };
          const action = btn?.action ?? btn?.data ?? btn?.callback_data;
          return action == null ? null : { text, action: String(action).slice(0, 256) };
        })
        .filter(Boolean)
    )
    .filter((row) => row.length);
  return rows.length ? rows : undefined;
}

async function sendBotMessage(botUserId, chatId, text, { keyboard, replyToId, attachments } = {}) {
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
    keyboard: normalizeKeyboard(keyboard),
    attachments: Array.isArray(attachments) ? attachments : undefined,
    readByIds: [],
  });
  broadcastToUsers(chat.memberIds, { type: "message:new", chatId, message });
  return message;
}

module.exports = { sendBotMessage, normalizeKeyboard };
