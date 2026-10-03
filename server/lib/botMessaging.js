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

// visibleTo — id участника группы: сообщение увидит только он (как скрытые
// ответы ботов в группах Telegram). Остальным оно сразу «удалено у себя».
async function sendBotMessage(botUserId, chatId, text, { keyboard, replyToId, attachments, visibleTo } = {}) {
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
  let visibleToId = null;
  if (visibleTo != null) {
    if (chat.type !== "group" || typeof visibleTo !== "string" || !chat.memberIds.includes(visibleTo)) {
      throw new Error("visibleTo must be a member of this group");
    }
    visibleToId = visibleTo;
  }

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
    visibleToId,
    deletedForIds: visibleToId ? chat.memberIds.filter((id) => id !== visibleToId && id !== botUserId) : [],
  });
  registerAttachments(chat.id, message.attachments);
  broadcastToUsers(visibleToId ? [visibleToId, botUserId] : chat.memberIds, { type: "message:new", chatId, message });
  if (!visibleToId) dispatchToOtherBots(chat, message);
  return message;
}

// Чаты бот-бот: сообщение бота получают другие боты с кодом в этом же чате
// (msg.fromBot = true, чтобы бот мог их отличить). Чтобы два бота не
// перебрасывались ответами бесконечно — не больше BOT_TO_BOT_MAX в минуту на чат.
const BOT_TO_BOT_MAX = 20;
const botToBotHits = new Map();
function dispatchToOtherBots(chat, message) {
  const others = chat.memberIds.filter((id) => id !== message.senderId);
  if (!others.length) return;
  const now = Date.now();
  const hits = (botToBotHits.get(chat.id) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= BOT_TO_BOT_MAX) return;
  const { getBotByUserId } = require("../data/bots");
  const { runBotCode } = require("./botSandbox");
  for (const id of others) {
    getBotByUserId(id)
      .then((bot) => {
        if (!bot?.code?.trim()) return;
        hits.push(Date.now());
        botToBotHits.set(chat.id, hits);
        if (hits.length > BOT_TO_BOT_MAX) return;
        return runBotCode(bot, bot.code, { id: message.id, chatId: chat.id, senderId: message.senderId, text: message.text, createdAt: message.createdAt, fromBot: true });
      })
      .catch((err) => console.error(`bot-to-bot dispatch failed for ${id}:`, err));
  }
}

module.exports = { sendBotMessage, normalizeKeyboard };
