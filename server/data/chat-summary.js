const db = require("../db");
const { rowToMessage, readWatermarksFor } = require("./messages");
const { listUsersByIds } = require("./users");
const { publicUserFor } = require("../lib/privacyRules");
const { getSettings, updateSettings, mutedStateFor, isQuietNow } = require("./settings");

function jsonHas(id) {
  return `%"${id}"%`;
}

// Последнее видимое сообщение — точечно по индексу (chatId, createdAt), начиная с
// самого нового: оконная функция по всем сообщениям всех чатов (ROW_NUMBER … PARTITION
// BY chatId) на больших аккаунтах занимала больше секунды и держала весь процесс.
// clearedBefore — отметка очистки истории у этого пользователя ("" — не очищал).
const lastOfChatStmt = db.prepare(
  `SELECT * FROM messages
    WHERE chatId = ? AND threadRootId IS NULL AND deletedForIds NOT LIKE ? AND createdAt > ?
    ORDER BY createdAt DESC, rowid DESC
    LIMIT 1`
);

// Непрочитанные считаем точечно, по индексу (chatId, createdAt): соединение
// messages со списком чатов заставляло SQLite читать всю таблицу сообщений.
const unreadOfChatStmt = db.prepare(
  `SELECT COUNT(*) AS unread, SUM(CASE WHEN mentionedUserIds LIKE ? THEN 1 ELSE 0 END) AS mentions
     FROM messages
    WHERE chatId = ? AND threadRootId IS NULL AND senderId <> ?
      AND createdAt > ?
      AND readByIds NOT LIKE ? AND deletedForIds NOT LIKE ?`
);

async function attachSummaries(chats, userId) {
  if (!chats.length) return [];
  const safeParse = (val, fallback) => {
    if (val === null || val === undefined || val === "") return fallback;
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch { return fallback; }
  };
  let settings;
  try { settings = await getSettings(userId); } catch { settings = {}; }
  const chatClears = settings.chatClears ?? {};
  const drafts = settings.drafts ?? {};
  const chatFlags = settings.chatFlags ?? {};
  const pinnedOrder = settings.pinnedOrder ?? [];
  const ids = chats.map((c) => c.id);
  const notDeleted = jsonHas(userId);

  const lastByChat = new Map();
  for (const id of ids) {
    try {
      const row = lastOfChatStmt.get(id, notDeleted, chatClears[id] ?? "");
      if (row) lastByChat.set(id, row);
    } catch { /* последнего сообщения нет */ }
  }

  const watermarks = readWatermarksFor(userId);

  const unreadByChat = new Map();
  for (const chat of chats) {
    const since = [watermarks.get(chat.id) ?? "", chatClears[chat.id] ?? ""].sort().pop();
    try {
      unreadByChat.set(
        chat.id,
        unreadOfChatStmt.get(notDeleted, chat.id, userId, since, notDeleted, notDeleted) ?? { unread: 0, mentions: 0 }
      );
    } catch { /* непрочитанные = 0 */ }
  }

  const peerIds = new Set();
  for (const chat of chats) {
    if (chat.type === "dm" || chat.type === "bot") {
      const other = chat.memberIds.find((id) => id !== userId);
      if (other) peerIds.add(other);
    }
  }
  const peers = new Map();
  try {
    const peerUsers = await listUsersByIds([...peerIds]);
    await Promise.all(
      peerUsers.map(async (user) => {
        peers.set(user.id, await publicUserFor(user, userId));
      })
    );
  } catch { /* peers = empty */ }

  const unarchive = [];

  const result = chats.map((chat) => {
    try {
    let lastMessage = null;
    try {
      const row = lastByChat.get(chat.id);
      lastMessage = row ? rowToMessage(row) : null;
    } catch { lastMessage = null; }

    const u = unreadByChat.get(chat.id);
    const unreadCount = u?.unread ?? 0;
    const hasUnreadMention = (u?.mentions ?? 0) > 0;

    const otherUserId = (chat.type === "dm" || chat.type === "bot") && chat.memberIds.find((id) => id !== userId);
    const otherUser = otherUserId ? peers.get(otherUserId) ?? null : null;

    const isSaved = chat.type === "dm" && chat.memberIds.length === 1 && chat.memberIds[0] === userId;

    const flags = chatFlags[chat.id];
    let archived = typeof flags?.archived === "boolean" ? flags.archived : !!chat.archived;
    try {
      if (
        archived &&
        flags?.archivedAt &&
        lastMessage &&
        lastMessage.senderId !== userId &&
        lastMessage.type !== "system" &&
        lastMessage.createdAt > flags.archivedAt &&
        !isQuietNow(settings, chat.id) &&
        !(typeof flags.muted === "boolean" ? flags.muted : chat.muted)
      ) {
        archived = false;
        unarchive.push(chat.id);
      }
    } catch {}
    const pinIdx = pinnedOrder.indexOf(chat.id);

    return {
      ...chat,
      ...(mutedStateFor(settings, chat.id).muted || mutedStateFor(settings, chat.id).mutedUntil || typeof chatFlags[chat.id]?.muted === "boolean"
        ? mutedStateFor(settings, chat.id)
        : { muted: !!chat.muted, mutedUntil: chat.mutedUntil ?? null }),
      pinned: typeof chatFlags[chat.id]?.pinned === "boolean" ? chatFlags[chat.id].pinned : !!chat.pinned,
      archived,
      pinOrder: pinIdx >= 0 ? pinIdx : null,
      title: isSaved ? "Избранное" : chat.title,
      isSaved: isSaved || undefined,
      lastMessage,
      unreadCount,
      hasUnreadMention,
      unread: !!flags?.unread || undefined,
      otherUser: isSaved ? null : otherUser,
      draft: drafts[chat.id] ?? null,
    };
    } catch (err) {
      // Один повреждённый чат (битый JSON, потерянный ключ секретного чата) не
      // должен обнулять весь список: отдаём чат без последнего сообщения.
      console.error("chat summary failed:", chat?.id, err?.message || err);
      return { ...chat, lastMessage: null, unreadCount: 0, hasUnreadMention: false, otherUser: null, draft: null, pinOrder: null };
    }
  });

  if (unarchive.length) {
    try {
      const fresh = await getSettings(userId);
      const nextFlags = { ...(fresh.chatFlags ?? {}) };
      for (const id of unarchive) {
        const { archivedAt, ...rest } = nextFlags[id] ?? {};
        nextFlags[id] = { ...rest, archived: false };
      }
      await updateSettings(userId, { chatFlags: nextFlags });
    } catch {}
  }
  return result;
}

// «Удалённый у себя» чат не попадает в список, пока в нём не появится сообщение новее
// отметки удаления (история до неё скрыта той же отметкой в chatClears).
function withoutHidden(summaries, hiddenChats) {
  if (!hiddenChats || !Object.keys(hiddenChats).length) return summaries;
  return summaries.filter((c) => !hiddenChats[c.id] || c.lastMessage);
}

module.exports = { attachSummaries, withoutHidden };
