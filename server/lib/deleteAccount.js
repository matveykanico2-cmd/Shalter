// "Delete my account" (Settings → Конфиденциальность → Удалить аккаунт) —
// a real, permanent deletion, not a soft/anonymized one. Deliberately
// reuses the exact same per-chat logic as POST /:id/leave (server/routes/
// chats.js) for groups/channels — ownership transfer, and deleting the chat
// entirely once it'd otherwise be memberless — rather than a second,
// possibly-diverging copy of that logic. DMs are hard-deleted outright
// (same as the existing "Удалить чат" action) since a DM with the other
// party gone isn't a conversation anyone can continue anyway.
const { listChatsForUser, updateChat, deleteChat } = require("../data/chats");
const { deleteMessagesForChat } = require("../data/messages");
const { removeAllSessionsForUser } = require("../data/sessions");
const { removeAllContactsInvolving } = require("../data/contacts");
const { listBotsByOwner, deleteBot } = require("../data/bots");
const { deleteUser } = require("../data/users");

// Каждый шаг — сам по себе.
//
// Раньше любая одна осечка (чат, который уже кто-то удалил секундой раньше;
// бот, чья строка не сошлась) обрывала всю процедуру на середине: человек
// видел «internal error», а аккаунт оставался наполовину удалённым — часть
// чатов уже нет, сам аккаунт на месте, и повторная попытка спотыкалась о те же
// остатки. Удаление обязано доходить до конца: последние три действия —
// сессии, контакты и сама учётная запись — важнее любого промежуточного шага.
async function step(what, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`удаление аккаунта: шаг «${what}» не выполнен:`, err.message);
  }
}

async function deleteAccount(userId) {
  const chats = await listChatsForUser(userId).catch(() => []);
  for (const chat of chats) {
    if (chat.type === "dm") {
      await step(`личный чат ${chat.id}`, async () => {
        await deleteMessagesForChat(chat.id);
        await deleteChat(chat.id);
      });
      continue;
    }
    const memberIds = chat.memberIds.filter((m) => m !== userId);
    const adminIds = chat.adminIds?.filter((m) => m !== userId);
    await step(`чат ${chat.id}`, async () => {
      if (memberIds.length === 0) {
        await deleteMessagesForChat(chat.id);
        await deleteChat(chat.id);
      } else {
        await updateChat(chat.id, {
          memberIds,
          adminIds,
          ownerId: chat.ownerId === userId ? memberIds[0] : chat.ownerId,
        });
      }
    });
  }

  const bots = await listBotsByOwner(userId).catch(() => []);
  for (const bot of bots) {
    await step(`бот ${bot.id}`, async () => {
      await deleteBot(bot.id);
      await deleteUser(bot.userId); // the bot's own `users` row (isBot: true)
    });
  }

  await step("сессии", () => removeAllSessionsForUser(userId));
  await step("контакты", () => removeAllContactsInvolving(userId));
  // А вот это уже без страховки: если не удалилась сама учётная запись, то
  // аккаунт не удалён, и говорить об успехе нельзя.
  await deleteUser(userId);
}

module.exports = { deleteAccount };
