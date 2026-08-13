const { listAllMessages } = require("./messages");
const { listUsers } = require("./users");
const { publicUser } = require("./sanitize");
const { getSettings } = require("./settings");

async function attachSummaries(chats, userId) {
  const [allMessages, users, settings] = await Promise.all([listAllMessages(), listUsers(), getSettings(userId)]);
  const chatClears = settings.chatClears ?? {};
  const drafts = settings.drafts ?? {};

  return chats.map((chat) => {
    const clearedBefore = chatClears[chat.id];
    const msgs = allMessages
      .filter((m) => m.chatId === chat.id)
      .filter((m) => !m.deletedForIds?.includes(userId))
      .filter((m) => !clearedBefore || m.createdAt > clearedBefore)
      // Thread replies (threadRootId set) don't surface as the chat's own
      // "last message" preview or count toward its main unread badge — same
      // exclusion listMessages() applies to the main timeline itself; a
      // thread has its own reply-count indicator (messageBubble.js) instead.
      .filter((m) => !m.threadRootId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
    const unread = msgs.filter((m) => !m.readByIds.includes(userId) && m.senderId !== userId);
    const unreadCount = unread.length;
    // Drives chatListItem.js's "@" badge — same idea as Telegram's own
    // unread-mention indicator, distinct from the plain numeric unread
    // count since a mention warrants attention even in a busy muted group.
    const hasUnreadMention = unread.some((m) => m.mentionedUserIds?.includes(userId));
    const otherUserId = (chat.type === "dm" || chat.type === "bot") && chat.memberIds.find((id) => id !== userId);
    const otherUserRaw = otherUserId ? users.find((u) => u.id === otherUserId) : undefined;
    const otherUser = otherUserRaw ? publicUser(otherUserRaw) : null;

    return { ...chat, lastMessage, unreadCount, hasUnreadMention, otherUser, draft: drafts[chat.id] ?? null };
  });
}

module.exports = { attachSummaries };
