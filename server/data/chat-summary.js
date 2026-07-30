const { listAllMessages } = require("./messages");
const { listUsers } = require("./users");
const { publicUser } = require("./sanitize");
const { getSettings } = require("./settings");

async function attachSummaries(chats, userId) {
  const [allMessages, users, settings] = await Promise.all([listAllMessages(), listUsers(), getSettings(userId)]);
  const chatClears = settings.chatClears ?? {};

  return chats.map((chat) => {
    const clearedBefore = chatClears[chat.id];
    const msgs = allMessages
      .filter((m) => m.chatId === chat.id)
      .filter((m) => !m.deletedForIds?.includes(userId))
      .filter((m) => !clearedBefore || m.createdAt > clearedBefore)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
    const unreadCount = msgs.filter((m) => !m.readByIds.includes(userId) && m.senderId !== userId).length;
    const otherUserId =
      (chat.type === "dm" || chat.type === "secret" || chat.type === "bot") &&
      chat.memberIds.find((id) => id !== userId);
    const otherUserRaw = otherUserId ? users.find((u) => u.id === otherUserId) : undefined;
    const otherUser = otherUserRaw ? publicUser(otherUserRaw) : null;

    return { ...chat, lastMessage, unreadCount, otherUser };
  });
}

module.exports = { attachSummaries };
