const { listChatsForUser, updateChat, deleteChat } = require("../data/chats");
const { deleteMessagesForChat } = require("../data/messages");
const { removeAllSessionsForUser } = require("../data/sessions");
const { removeAllContactsInvolving } = require("../data/contacts");
const { listBotsByOwner, deleteBot } = require("../data/bots");
const { deleteUser } = require("../data/users");

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
      await deleteUser(bot.userId);
    });
  }

  await step("сессии", () => removeAllSessionsForUser(userId));
  await step("контакты", () => removeAllContactsInvolving(userId));
  await deleteUser(userId);
}

module.exports = { deleteAccount };
