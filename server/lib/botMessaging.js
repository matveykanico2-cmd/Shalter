const { getChat } = require("../data/chats");
const { addMessage, getMessage } = require("../data/messages");
const { getUser } = require("../data/users");
const { genId } = require("./genId");
const { sanitizeAttachments } = require("./sanitizeAttachments");
const { registerAttachments } = require("./uploadAccess");
const { isStaff } = require("./chatPermissions");
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
          // Цвет кнопки, как в Telegram: primary / success / danger.
          const style = ["primary", "success", "danger"].includes(btn?.style) ? { style: btn.style } : {};
          if (btn?.app) return { text, app: String(btn.app), ...style };
          if (btn?.url != null) {
            const url = String(btn.url).trim().slice(0, 2048);
            return /^https?:\/\/[^\s]+$/i.test(url) ? { text, url, ...style } : null;
          }
          const action = btn?.action ?? btn?.data ?? btn?.callback_data;
          return action == null ? null : { text, action: String(action).slice(0, 256), ...style };
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
  if (chat.type === "channel" && !isStaff(chat, botUserId)) throw new Error("Bot must be an admin to post in a channel");
  if (chat.type === "dm") {
    const other = await getUser(chat.memberIds.find((id) => id !== botUserId));
    if (other?.blockedUserIds?.includes(botUserId)) throw new Error("User has blocked the bot");
  }
  const reply = typeof replyToId === "string" && replyToId ? await getMessage(replyToId) : null;

  const message = await addMessage({
    id: genId("m"),
    chatId,
    senderId: botUserId,
    type: "text",
    text: String(text).slice(0, 4096),
    createdAt: new Date().toISOString(),
    replyToId: reply?.chatId === chat.id ? reply.id : null,
    keyboard: normalizeKeyboard(keyboard),
    // Бот присылает вложения сам — те же проверки, что у людей (без javascript:-ссылок и т. п.).
    attachments: sanitizeAttachments(attachments),
    readByIds: [],
  });
  registerAttachments(chat.id, message.attachments);
  broadcastToUsers(chat.memberIds, { type: "message:new", chatId, message });
  return message;
}

module.exports = { sendBotMessage, normalizeKeyboard };
