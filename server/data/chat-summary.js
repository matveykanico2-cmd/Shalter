const db = require("../db");
const { rowToMessage, readWatermarksFor } = require("./messages");
const { listUsersByIds } = require("./users");
const { publicUserFor } = require("../lib/privacyRules");
const { getSettings, updateSettings, mutedStateFor, isQuietNow } = require("./settings");

function jsonHas(id) {
  return `%"${id}"%`;
}

const PLACEHOLDER = " (?) ";
function inClause(n) {
  return n === 1 ? "(?)" : "(" + Array.from({ length: n }, () => "?").join(",") + ")";
}

// Список чатов режем на пачки: SQLite не принимает больше 500 слагаемых в
// compound SELECT (UNION ALL), а IN(...) с тысячами параметров готовится слишком
// долго. Раньше на больших аккаунтах запрос непрочитанных падал или выполнялся
// минутами — список чатов в клиенте не успевал прийти и оставался пустым.
const CHAT_CHUNK = 200;

let lastOfStmtCache = new Map();
function lastOfStmt(n) {
  let s = lastOfStmtCache.get(n);
  if (!s) {
    lastOfStmtCache.set(
      n,
      (s = db.prepare(
        `SELECT * FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY chatId ORDER BY createdAt DESC, rowid DESC) AS rn
           FROM messages
           WHERE chatId IN ${inClause(n)}
             AND threadRootId IS NULL
             AND deletedForIds NOT LIKE ?
         ) WHERE rn <= 5`
      ))
    );
  }
  return s;
}

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

  const lastByChat = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i += CHAT_CHUNK) {
    const chunk = ids.slice(i, i + CHAT_CHUNK);
    try {
      const lastRows = lastOfStmt(chunk.length).all(...chunk, notDeleted);
      for (const r of lastRows) {
        const list = lastByChat.get(r.chatId);
        if (list) list.push(r);
      }
    } catch { /* в этой пачке сообщений нет */ }
  }
  for (const list of lastByChat.values()) if (list.length > 1) list.sort((a, b) => a.rn - b.rn);

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
    const clearedBefore = chatClears[chat.id];
    const candidates = (lastByChat.get(chat.id) ?? []).filter(
      (r) => !clearedBefore || r.createdAt > clearedBefore
    );
    let lastMessage = null;
    try {
      lastMessage = candidates.length ? rowToMessage(candidates[0]) : null;
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

module.exports = { attachSummaries };
