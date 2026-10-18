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
         ) WHERE rn = 1`
      ))
    );
  }
  return s;
}

let unreadStmtCache = new Map();
function unreadStmt(n) {
  let s = unreadStmtCache.get(n);
  if (!s) {
    const unionParts = Array.from({ length: n }, () => "SELECT ? AS chatId, ? AS since").join(" UNION ALL ");
    unreadStmtCache.set(
      n,
      (s = db.prepare(
        `SELECT m.chatId AS chatId,
                COUNT(*) AS unread,
                SUM(CASE WHEN m.mentionedUserIds LIKE ? THEN 1 ELSE 0 END) AS mentions
         FROM messages m
         JOIN (${unionParts}) AS thr ON m.chatId = thr.chatId
         WHERE m.threadRootId IS NULL
           AND m.senderId <> ?
           AND m.createdAt > thr.since
           AND m.readByIds NOT LIKE ?
           AND m.deletedForIds NOT LIKE ?
         GROUP BY m.chatId`
      ))
    );
  }
  return s;
}

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
  try {
    const lastRows = lastOfStmt(ids.length).all(...ids, notDeleted);
    for (const r of lastRows) lastByChat.set(r.chatId, [r]);
  } catch { /* no messages */ }

  const watermarks = readWatermarksFor(userId);

  const thrParams = [];
  for (const chat of chats) {
    const since = [watermarks.get(chat.id) ?? "", chatClears[chat.id] ?? ""].sort().pop();
    thrParams.push(chat.id, since);
  }
  const unreadByChat = new Map();
  try {
    const unreadRows = unreadStmt(chats.length).all(
      ...thrParams,
      notDeleted,
      userId,
      notDeleted,
      notDeleted
    );
    for (const r of unreadRows) unreadByChat.set(r.chatId, r);
  } catch { /* unread = 0 for all */ }

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
