const db = require("../db");
const { rowToMessage, readWatermarksFor } = require("./messages");
const { getUser } = require("./users");
const { publicUser } = require("./sanitize");
const { getSettings, updateSettings, mutedStateFor, isQuietNow } = require("./settings");

function jsonHas(id) {
  return `%"${id}"%`;
}

async function attachSummaries(chats, userId) {
  if (!chats.length) return [];
  const settings = await getSettings(userId);
  const mutedOf = (id) => mutedStateFor(settings, id);
  const chatClears = settings.chatClears ?? {};
  const drafts = settings.drafts ?? {};
  const chatFlags = settings.chatFlags ?? {};
  const ids = chats.map((c) => c.id);

  const lastOfChat = db.prepare(
    `SELECT * FROM messages
      WHERE chatId = ? AND threadRootId IS NULL AND deletedForIds NOT LIKE ?
      ORDER BY createdAt DESC, rowid DESC LIMIT 5`
  );
  const lastByChat = new Map(ids.map((id) => [id, lastOfChat.all(id, jsonHas(userId))]));

  const watermarks = readWatermarksFor(userId);
  const unreadOfChat = db.prepare(
    `SELECT COUNT(*) AS unread, SUM(CASE WHEN mentionedUserIds LIKE ? THEN 1 ELSE 0 END) AS mentions
       FROM messages
      WHERE chatId = ? AND threadRootId IS NULL AND senderId <> ?
        AND createdAt > ?
        AND readByIds NOT LIKE ? AND deletedForIds NOT LIKE ?`
  );

  const peerIds = new Set();
  for (const chat of chats) {
    if (chat.type === "dm" || chat.type === "bot") {
      const other = chat.memberIds.find((id) => id !== userId);
      if (other) peerIds.add(other);
    }
  }
  const peers = new Map();
  for (const id of peerIds) {
    const user = await getUser(id);
    if (user) peers.set(id, publicUser(user));
  }

  const pinnedOrder = settings.pinnedOrder ?? [];
  const unarchive = [];

  const result = chats.map((chat) => {
    const clearedBefore = chatClears[chat.id];
    const candidates = (lastByChat.get(chat.id) ?? []).filter((r) => !clearedBefore || r.createdAt > clearedBefore);
    const lastMessage = candidates.length ? rowToMessage(candidates[0]) : null;

    const since = [watermarks.get(chat.id) ?? "", clearedBefore ?? ""].sort().pop();
    const row = unreadOfChat.get(jsonHas(userId), chat.id, userId, since, jsonHas(userId), jsonHas(userId));
    const unreadCount = row?.unread ?? 0;
    const hasUnreadMention = (row?.mentions ?? 0) > 0;

    const otherUserId = (chat.type === "dm" || chat.type === "bot") && chat.memberIds.find((id) => id !== userId);
    const otherUser = otherUserId ? peers.get(otherUserId) ?? null : null;

    const isSaved = chat.type === "dm" && chat.memberIds.length === 1 && chat.memberIds[0] === userId;

    const flags = chatFlags[chat.id];
    let archived = typeof flags?.archived === "boolean" ? flags.archived : !!chat.archived;
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
    const fresh = await getSettings(userId);
    const nextFlags = { ...(fresh.chatFlags ?? {}) };
    for (const id of unarchive) {
      const { archivedAt, ...rest } = nextFlags[id] ?? {};
      nextFlags[id] = { ...rest, archived: false };
    }
    await updateSettings(userId, { chatFlags: nextFlags });
  }
  return result;
}

module.exports = { attachSummaries };
