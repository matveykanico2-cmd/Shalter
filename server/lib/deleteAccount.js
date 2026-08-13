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

async function deleteAccount(userId) {
  const chats = await listChatsForUser(userId);
  for (const chat of chats) {
    if (chat.type === "dm") {
      await deleteMessagesForChat(chat.id);
      await deleteChat(chat.id);
      continue;
    }
    const memberIds = chat.memberIds.filter((m) => m !== userId);
    const adminIds = chat.adminIds?.filter((m) => m !== userId);
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
  }

  const bots = await listBotsByOwner(userId);
  for (const bot of bots) {
    await deleteBot(bot.id);
    await deleteUser(bot.userId); // the bot's own `users` row (isBot: true)
  }

  await removeAllSessionsForUser(userId);
  await removeAllContactsInvolving(userId);
  await deleteUser(userId);
}

module.exports = { deleteAccount };
