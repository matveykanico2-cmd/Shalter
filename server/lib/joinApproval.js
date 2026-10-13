// Заявки на вступление в канал/группу (chat.approveJoins): подача, одобрение и
// отказ — общий код для админов в приложении, Bot API и ботов с кодом. Как в
// Telegram, заявками может заниматься бот-админ: он получает событие
// join_request и вызывает approveJoin / declineJoin.
const { getChat, updateChat } = require("../data/chats");
const { getUser } = require("../data/users");
const { getBotByUserId } = require("../data/bots");
const { publicUser } = require("../data/sanitize");
const { logAdminAction } = require("../data/adminLog");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const joinRequests = require("../data/joinRequests");
const { sendMessageAndBroadcast } = require("./systemChat");
const { broadcastToUsers } = require("../ws");

function isOwnerOrAdminOf(chat, userId) {
  return chat?.ownerId === userId || (chat?.ownerIds ?? []).includes(userId) || (chat?.adminIds ?? []).includes(userId);
}

// Приветствие новому участнику группы, если админы его задали. {name} — имя вступившего.
async function sendWelcome(chat, userId) {
  if (chat.type !== "group" || !chat.welcomeText) return;
  try {
    const user = await getUser(userId);
    if (!user || user.isBot) return;
    const text = chat.welcomeText.replaceAll("{name}", user.name ?? "");
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `👋 ${text}`, { type: "system" });
  } catch (err) {
    console.error("welcome message failed:", err);
  }
}

// Новая заявка: админам — событие в приложение, ботам-админам с кодом — join_request.
async function submitJoinRequest(chat, userId) {
  joinRequests.addRequest(chat.id, userId);
  const who = await getUser(userId);
  const admins = chat.memberIds.filter((id) => isOwnerOrAdminOf(chat, id));
  broadcastToUsers(admins, { type: "chat:join-request", chatId: chat.id, user: publicUser(who) });
  const { runBotCode } = require("./botSandbox");
  for (const adminId of admins) {
    getBotByUserId(adminId)
      .then((bot) => {
        if (!bot?.code?.trim()) return;
        return runBotCode(bot, bot.code, {
          type: "join_request",
          id: `jr_${chat.id}_${userId}`,
          chatId: chat.id,
          chatTitle: chat.title,
          senderId: userId,
          userId,
          userName: who?.name ?? "",
          username: who?.username ?? "",
          bio: who?.bio ?? "",
          text: "",
          createdAt: new Date().toISOString(),
        });
      })
      .catch((err) => console.error(`join request dispatch failed for bot ${adminId}:`, err));
  }
}

// Решение по заявке. actorId — кто решил (админ или бот). Возвращает
// { approved, chat } или бросает ошибку со status.
async function decideJoinRequest(chatId, userId, approve, actorId) {
  const chat = await getChat(chatId);
  if (!chat) throw Object.assign(new Error("Чат не найден"), { status: 404 });
  if (!isOwnerOrAdminOf(chat, actorId)) throw Object.assign(new Error("Недостаточно прав"), { status: 403 });
  if (!joinRequests.hasRequest(chat.id, userId)) throw Object.assign(new Error("Заявка не найдена"), { status: 404 });
  joinRequests.removeRequest(chat.id, userId);
  if (!approve) {
    logAdminAction(chat.id, actorId, "join_decline", { targetId: userId });
    broadcastToUsers([userId], { type: "chat:join-declined", chatId: chat.id, title: chat.title });
    return { approved: false, chat };
  }
  if ((chat.bannedIds ?? []).includes(userId)) throw Object.assign(new Error("Пользователь заблокирован в этом чате"), { status: 409 });
  const updated = await updateChat(chat.id, { memberIds: [...new Set([...chat.memberIds, userId])] });
  logAdminAction(chat.id, actorId, "join_approve", { targetId: userId });
  broadcastToUsers([userId], { type: "chat:added", chat: updated });
  broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
  await sendWelcome(updated, userId);
  return { approved: true, chat: updated };
}

module.exports = { isOwnerOrAdminOf, sendWelcome, submitJoinRequest, decideJoinRequest };
