// Удаление групп, каналов и ботов модерацией Shalter: запись в журнал,
// оповещение участников и уведомление владельцу от системного бота.
// Используется и одиночным удалением (DELETE /api/chats/:id, /api/admin/bots),
// и массовым из каталога модерации (POST /api/admin/moderation/delete).

const { getChat, deleteChat } = require("../data/chats");
const { deleteMessagesForChat } = require("../data/messages");
const { getUser, deleteUser } = require("../data/users");
const { getBotByUserId, deleteBot, listBotDmChatIds } = require("../data/bots");
const { logExport } = require("../data/dataExport");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { HELPER_BOT_ID } = require("../data/helperBot");
const { HUGO_ID } = require("../data/hugoBot");

// Служебные аккаунты Shalter. Префикс «bot_» тут не годится: его носят и
// обычные боты, созданные пользователями (genId("bot")).
const SERVICE_ACCOUNT_IDS = new Set([SYSTEM_BOT_ID, HELPER_BOT_ID, HUGO_ID]);
function isServiceAccount(id) {
  return SERVICE_ACCOUNT_IDS.has(id);
}
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { broadcastToUsers } = require("../ws");

const KIND_LABEL = { channel: ["Канал", "КАНАЛА", "удалён"], group: ["Группа", "ГРУППЫ", "удалена"] };

async function notifyOwner(ownerId, text) {
  try {
    const dm = await findOrCreateDm(SYSTEM_BOT_ID, ownerId);
    await sendMessageAndBroadcast(dm, SYSTEM_BOT_ID, text);
  } catch (err) {
    console.error("moderation notice failed:", err);
  }
}

async function removeChat(chat) {
  broadcastToUsers(chat.memberIds, { type: "chat:deleted", chatId: chat.id });
  await deleteMessagesForChat(chat.id);
  await deleteChat(chat.id);
}

// Удаляет группу или канал. У канала заодно уходит и его группа обсуждения —
// иначе она остаётся висеть без канала.
async function moderateDeleteChat(chat, { adminId, reason, notify = true }) {
  if (!chat || (chat.type !== "group" && chat.type !== "channel")) throw Object.assign(new Error("Группа или канал не найдены"), { status: 404 });
  const [kind, kindUpper, verb] = KIND_LABEL[chat.type];
  const owners = [...new Set([chat.ownerId, ...(chat.ownerIds ?? [])].filter(Boolean))];
  try {
    await logExport({
      adminId,
      targetUserId: owners[0] ?? adminId,
      reason: `УДАЛЕНИЕ ${kindUpper} «${chat.title ?? ""}»${chat.username ? ` @${chat.username}` : ""} (${chat.id}): ${reason || "нарушение правил"}`,
      messageCount: 0,
    });
  } catch (err) {
    console.error("moderation log failed:", err);
  }
  await removeChat(chat);
  if (chat.type === "channel" && chat.linkedDiscussionChatId) {
    const discussion = await getChat(chat.linkedDiscussionChatId);
    if (discussion) await removeChat(discussion);
  }
  if (notify) {
    for (const ownerId of owners) {
      await notifyOwner(ownerId, `🛡 ${kind} «${chat.title ?? chat.name}» ${verb} модерацией Shalter за нарушение правил.${reason ? `\nПричина: ${reason}` : ""}`);
    }
  }
  return { id: chat.id, kind: chat.type, title: chat.title ?? "" };
}

// Удаляет бота вместе с его аккаунтом.
async function moderateDeleteBot(botUserId, { adminId, reason }) {
  const botUser = await getUser(botUserId);
  const bot = botUser?.isBot ? await getBotByUserId(botUser.id) : null;
  if (!bot) throw Object.assign(new Error("Бот не найден"), { status: 404 });
  if (isServiceAccount(botUser.id)) throw Object.assign(new Error("Служебных ботов Shalter удалять нельзя"), { status: 400 });
  await logExport({
    adminId,
    targetUserId: bot.ownerId ?? botUser.id,
    reason: `УДАЛЕНИЕ БОТА ${botUser.username ? `@${botUser.username}` : botUser.id} (${botUser.name}): ${reason}`,
    messageCount: 0,
  });
  const chatIds = listBotDmChatIds(botUser.id);
  await deleteBot(bot.id);
  await deleteUser(botUser.id);
  for (const chatId of chatIds) {
    const chat = await getChat(chatId);
    if (chat) broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: { id: chat.id } });
  }
  if (bot.ownerId) await notifyOwner(bot.ownerId, `🛡 Бот «${botUser.name}» удалён модерацией Shalter за нарушение правил.\nПричина: ${reason}`);
  return { id: botUser.id, kind: "bot", title: botUser.name };
}

module.exports = { moderateDeleteChat, moderateDeleteBot, isServiceAccount };
