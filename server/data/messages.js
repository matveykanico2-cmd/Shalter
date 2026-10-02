const db = require("../db");
const { encryptText, decryptText, searchQuery, hasLink } = require("../lib/textCrypto");

function rowToMessage(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    type: row.type,
    text: decryptText(row.id, row.text),
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? undefined,
    pinned: !!row.pinned,
    replyToId: row.replyToId ?? null,
    forwardedFrom: row.forwardedFrom ? JSON.parse(row.forwardedFrom) : undefined,
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    keyboard: row.keyboard ? JSON.parse(row.keyboard) : undefined,
    gift: row.gift ? JSON.parse(row.gift) : undefined,
    sticker: row.sticker ? JSON.parse(row.sticker) : undefined,
    customEmoji: row.customEmoji ? JSON.parse(row.customEmoji) : undefined,
    linkPreview: row.linkPreview ? JSON.parse(row.linkPreview) : undefined,
    report: row.report ? JSON.parse(row.report) : undefined,
    reactions: JSON.parse(row.reactions),
    readByIds: JSON.parse(row.readByIds),
    deletedForIds: JSON.parse(row.deletedForIds),
    mentionedUserIds: row.mentionedUserIds ? JSON.parse(row.mentionedUserIds) : [],
    threadRootId: row.threadRootId ?? undefined,
    topicId: row.topicId ?? undefined,
    readAt: row.readAt ?? undefined,
    effect: row.effect ?? undefined,
    storyReply: row.storyReply ? JSON.parse(row.storyReply) : undefined,
    anchorForPostId: row.anchorForPostId ?? undefined,
    discussionAnchorId: row.discussionAnchorId ?? undefined,
    signedBy: row.signedBy ?? undefined,
    anonymous: !!row.anonymous || undefined,
    boostedUntil: row.boostedUntil ?? undefined,
    paidStars: row.paidStars || undefined,
    boostedById: row.boostedById ?? undefined,
    views: row.views,
    commentCount: row.commentCount || undefined,
  };
}

function listNewForBot(botUserId, { after, limit = 200 }) {
  return db
    .prepare(
      `SELECT m.* FROM messages m
         JOIN chat_members cm ON cm.chatId = m.chatId AND cm.userId = ?
        WHERE m.createdAt > ? AND m.senderId <> ?
        ORDER BY m.createdAt ASC LIMIT ?`
    )
    .all(botUserId, after, botUserId, limit)
    .map(rowToMessage);
}

function searchInChats(chatIds, query, { limit = 40 } = {}) {
  if (!chatIds.length || !query) return [];
  const match = searchQuery(query);
  if (!match) return [];
  const ph = chatIds.map(() => "?").join(",");
  try {
    return db
      .prepare(
        `SELECT m.* FROM messages_search f
           JOIN messages m ON m.rowid = f.rowid
          WHERE messages_search MATCH ? AND m.chatId IN (${ph})
          ORDER BY m.createdAt DESC LIMIT ?`
      )
      .all(match, ...chatIds, limit)
      .map(rowToMessage)
      .reverse();
  } catch {
    return [];
  }
}

function listMediaMessages(chatId, viewerId, { limit = 300 } = {}) {
  return db
    .prepare(
      `SELECT * FROM messages
        WHERE chatId = ?
          AND deletedForIds NOT LIKE ?
          AND threadRootId IS NULL
          AND (attachments IS NOT NULL OR linkPreview IS NOT NULL OR hasLink = 1)
        ORDER BY createdAt DESC LIMIT ?`
    )
    .all(chatId, `%"${viewerId}"%`, limit)
    .map(rowToMessage)
    .reverse();
}

function listAllMessages() {
  return db.prepare("SELECT * FROM messages").all().map(rowToMessage);
}

async function listMessages(chatId, viewerId, clearedBefore) {
  let rows = db.prepare("SELECT * FROM messages WHERE chatId = ? ORDER BY createdAt ASC").all(chatId).map(rowToMessage);
  if (viewerId) rows = rows.filter((m) => !m.deletedForIds?.includes(viewerId));
  if (clearedBefore) rows = rows.filter((m) => m.createdAt > clearedBefore);
  return rows.filter((m) => !m.threadRootId);
}

// topic: undefined — все сообщения чата; null — тема «Общее» (без topicId);
// строка — одна тема.
function listMessagesPage(chatId, viewerId, clearedBefore, { limit = 60, before = null, beforeId = null, topic } = {}) {
  const params = { chatId, limit: limit + 1 };
  let sql = "SELECT * FROM messages WHERE chatId = @chatId AND threadRootId IS NULL";
  if (topic === null) sql += " AND topicId IS NULL";
  else if (topic !== undefined) {
    sql += " AND topicId = @topic";
    params.topic = topic;
  }
  if (clearedBefore) {
    sql += " AND createdAt > @clearedBefore";
    params.clearedBefore = clearedBefore;
  }
  if (before) {
    if (beforeId) {
      sql += " AND (createdAt < @before OR (createdAt = @before AND id < @beforeId))";
      params.beforeId = beforeId;
    } else {
      sql += " AND createdAt < @before";
    }
    params.before = before;
  }
  sql += " ORDER BY createdAt DESC, id DESC LIMIT @limit";

  let rows = db.prepare(sql).all(params).map(rowToMessage);
  if (viewerId) rows = rows.filter((m) => !m.deletedForIds?.includes(viewerId));

  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);
  rows.reverse();
  return { messages: rows, hasMore };
}

async function listThreadReplies(rootId) {
  return db.prepare("SELECT * FROM messages WHERE threadRootId = ? ORDER BY createdAt ASC").all(rootId).map(rowToMessage);
}

async function getMessage(id) {
  return rowToMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id));
}

async function addMessage(message) {
  db.prepare(
    `INSERT INTO messages (id, chatId, senderId, type, text, hasLink, createdAt, editedAt, pinned, replyToId, forwardedFrom, attachments, keyboard, gift, sticker, customEmoji, report, reactions, readByIds, deletedForIds, mentionedUserIds, threadRootId, topicId, storyReply, anchorForPostId, discussionAnchorId, signedBy, views, commentCount, paidStars, anonymous, effect)
     VALUES (@id, @chatId, @senderId, @type, @text, @hasLink, @createdAt, @editedAt, @pinned, @replyToId, @forwardedFrom, @attachments, @keyboard, @gift, @sticker, @customEmoji, @report, @reactions, @readByIds, @deletedForIds, @mentionedUserIds, @threadRootId, @topicId, @storyReply, @anchorForPostId, @discussionAnchorId, @signedBy, @views, @commentCount, @paidStars, @anonymous, @effect)`
  ).run({
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    paidStars: message.paidStars ?? 0,
    type: message.type ?? "text",
    text: encryptText(message.id, message.text),
    hasLink: hasLink(message.text),
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    pinned: message.pinned ? 1 : 0,
    replyToId: message.replyToId ?? null,
    forwardedFrom: message.forwardedFrom ? JSON.stringify(message.forwardedFrom) : null,
    attachments: message.attachments ? JSON.stringify(message.attachments) : null,
    keyboard: message.keyboard ? JSON.stringify(message.keyboard) : null,
    gift: message.gift ? JSON.stringify(message.gift) : null,
    sticker: message.sticker ? JSON.stringify(message.sticker) : null,
    customEmoji: message.customEmoji ? JSON.stringify(message.customEmoji) : null,
    report: message.report ? JSON.stringify(message.report) : null,
    reactions: JSON.stringify(message.reactions ?? []),
    readByIds: JSON.stringify(message.readByIds ?? []),
    deletedForIds: JSON.stringify(message.deletedForIds ?? []),
    mentionedUserIds: JSON.stringify(message.mentionedUserIds ?? []),
    threadRootId: message.threadRootId ?? null,
    topicId: message.topicId ?? null,
    storyReply: message.storyReply ? JSON.stringify(message.storyReply) : null,
    anchorForPostId: message.anchorForPostId ?? null,
    discussionAnchorId: message.discussionAnchorId ?? null,
    signedBy: message.signedBy ?? null,
    views: message.views ?? 0,
    commentCount: message.commentCount ?? 0,
    anonymous: message.anonymous ? 1 : 0,
    effect: message.effect ?? null,
  });
  return getMessage(message.id);
}

async function deleteMessagesForChat(chatId) {
  db.prepare("DELETE FROM messages WHERE chatId = ?").run(chatId);
}

function deleteExpiredMessages(chatId, cutoffIso) {
  const ids = db.prepare("SELECT id FROM messages WHERE chatId = ? AND createdAt < ?").all(chatId, cutoffIso).map((r) => r.id);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
  return ids;
}

async function mutate(id, fn) {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  const existing = rowToMessage(row);
  if (!existing) return undefined;
  const updated = fn(existing);
  db.prepare(
    `UPDATE messages SET text = @text, hasLink = @hasLink, editedAt = @editedAt, pinned = @pinned, forwardedFrom = @forwardedFrom,
       attachments = @attachments, keyboard = @keyboard, reactions = @reactions, readByIds = @readByIds,
       deletedForIds = @deletedForIds, anchorForPostId = @anchorForPostId, discussionAnchorId = @discussionAnchorId,
       views = @views, commentCount = @commentCount, linkPreview = @linkPreview, report = @report
     WHERE id = @id`
  ).run({
    id,
    text: (updated.text ?? "") === existing.text ? row.text : encryptText(id, updated.text),
    hasLink: hasLink(updated.text),
    editedAt: updated.editedAt ?? null,
    pinned: updated.pinned ? 1 : 0,
    forwardedFrom: updated.forwardedFrom ? JSON.stringify(updated.forwardedFrom) : null,
    attachments: updated.attachments ? JSON.stringify(updated.attachments) : null,
    keyboard: updated.keyboard ? JSON.stringify(updated.keyboard) : null,
    reactions: JSON.stringify(updated.reactions ?? []),
    readByIds: JSON.stringify(updated.readByIds ?? []),
    deletedForIds: JSON.stringify(updated.deletedForIds ?? []),
    anchorForPostId: updated.anchorForPostId ?? null,
    discussionAnchorId: updated.discussionAnchorId ?? null,
    views: updated.views ?? 0,
    commentCount: updated.commentCount ?? 0,
    linkPreview: updated.linkPreview ? JSON.stringify(updated.linkPreview) : null,
    report: updated.report ? JSON.stringify(updated.report) : null,
  });
  return getMessage(id);
}

function setBoost(id, until, byId) {
  db.prepare("UPDATE messages SET boostedUntil = ?, boostedById = ? WHERE id = ?").run(until, byId, id);
  return getMessage(id);
}

function setLinkPreview(id, linkPreview) {
  return mutate(id, (m) => ({ ...m, linkPreview }));
}

function updateLiveLocation(id, senderId, lat, lng) {
  return mutate(id, (m) => {
    if (m.senderId !== senderId) return m;
    const nowIso = new Date().toISOString();
    const attachments = m.attachments?.map((a) => {
      if (a.kind !== "location" || !a.meta?.live) return a;
      if (a.meta.expiresAt && a.meta.expiresAt <= nowIso) return a;
      return { ...a, meta: { ...a.meta, lat, lng } };
    });
    return { ...m, attachments };
  });
}

function setAttachmentPreview(id, index, preview) {
  return mutate(id, (m) => {
    const attachments = m.attachments?.map((a, i) => {
      if (i !== index) return a;
      const next = { ...a, previewPending: undefined };
      for (const [key, value] of Object.entries(preview ?? {})) {
        if (value !== undefined && value !== null) next[key] = value;
      }
      return next;
    });
    return { ...m, attachments };
  });
}

function setReportMessageStatus(id, status) {
  return mutate(id, (m) => (m.report ? { ...m, report: { ...m.report, status } } : m));
}

function editMessage(id, text) {
  return mutate(id, (m) => ({ ...m, text, editedAt: new Date().toISOString() }));
}

async function deleteMessage(id) {
  db.prepare("DELETE FROM messages WHERE id = ?").run(id);
}

function deleteMessageForMe(id, userId) {
  return mutate(id, (m) => {
    const ids = new Set(m.deletedForIds ?? []);
    ids.add(userId);
    return { ...m, deletedForIds: [...ids] };
  });
}

function setKeyboard(id, keyboard) {
  return mutate(id, (m) => ({ ...m, keyboard: Array.isArray(keyboard) && keyboard.length ? keyboard : undefined }));
}

function togglePin(id, pinned) {
  return mutate(id, (m) => ({ ...m, pinned }));
}

function toggleReaction(id, emoji, userId, { maxReactionsPerUser = Infinity } = {}) {
  const clean = typeof emoji === "string" ? emoji.trim().slice(0, 40) : "";
  if (!clean) return getMessage(id);
  emoji = clean;
  return mutate(id, (m) => {
    const reactions = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(userId)) {
        existing.userIds = existing.userIds.filter((u) => u !== userId);
      } else {
        if (Number.isFinite(maxReactionsPerUser)) {
          const mine = reactions.filter((r) => r.userIds.includes(userId));
          while (mine.length >= maxReactionsPerUser) {
            const oldest = mine.shift();
            oldest.userIds = oldest.userIds.filter((u) => u !== userId);
          }
        }
        existing.userIds.push(userId);
      }
    } else {
      if (Number.isFinite(maxReactionsPerUser)) {
        const mine = reactions.filter((r) => r.userIds.includes(userId));
        while (mine.length >= maxReactionsPerUser) {
          const oldest = mine.shift();
          oldest.userIds = oldest.userIds.filter((u) => u !== userId);
        }
      }
      reactions.push({ emoji, userIds: [userId] });
    }
    return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
  });
}

function markRead(id, userId) {
  return mutate(id, (m) => (m.readByIds.includes(userId) ? m : { ...m, readByIds: [...m.readByIds, userId] }));
}

function setReadWatermark(chatId, userId, at) {
  db.prepare(
    `INSERT INTO chat_reads (chatId, userId, lastReadAt) VALUES (?, ?, ?)
     ON CONFLICT(chatId, userId) DO UPDATE SET lastReadAt = excluded.lastReadAt
     WHERE excluded.lastReadAt > chat_reads.lastReadAt`
  ).run(chatId, userId, at);
}

function readWatermarksFor(userId) {
  return new Map(
    db.prepare("SELECT chatId, lastReadAt FROM chat_reads WHERE userId = ?").all(userId).map((r) => [r.chatId, r.lastReadAt])
  );
}

// recordTime — запомнить время прочтения (только личка и если читатель не
// скрывает время захода от отправителя; это решает маршрут).
async function markChatRead(chatId, viewerId, { recordTime = false } = {}) {
  const rows = db
    .prepare("SELECT id, senderId, readByIds, createdAt FROM messages WHERE chatId = ? AND senderId <> ? AND readByIds NOT LIKE ?")
    .all(chatId, viewerId, `%"${viewerId}"%`);
  const changedIds = [];
  const update = db.prepare("UPDATE messages SET readByIds = ?, readAt = COALESCE(readAt, ?) WHERE id = ?");
  const now = recordTime ? new Date().toISOString() : null;
  const txn = db.transaction(() => {
    for (const row of rows) {
      if (row.senderId === viewerId) continue;
      const readByIds = JSON.parse(row.readByIds);
      if (readByIds.includes(viewerId)) continue;
      readByIds.push(viewerId);
      update.run(JSON.stringify(readByIds), now, row.id);
      changedIds.push(row.id);
    }
  });
  txn();
  const newest = db.prepare("SELECT MAX(createdAt) AS at FROM messages WHERE chatId = ?").get(chatId)?.at;
  if (newest) setReadWatermark(chatId, viewerId, newest);
  return changedIds;
}

function votePoll(id, optionIndex, userId) {
  return mutate(id, (m) => {
    const attachments = m.attachments?.map((a) => {
      if (a.kind !== "poll") return a;
      if (a.meta?.closed) return a;
      const options = a.meta?.options ?? [];
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) return a;
      const voterIds = options.map((_, i) => [...(a.meta?.voterIds?.[i] ?? [])]);
      const isQuiz = Number.isInteger(a.meta?.correctIndex);
      if (isQuiz && voterIds.some((ids) => ids.includes(userId))) return a;
      if (a.meta?.multiple && !isQuiz) {
        voterIds[optionIndex] = voterIds[optionIndex].includes(userId)
          ? voterIds[optionIndex].filter((v) => v !== userId)
          : [...voterIds[optionIndex], userId];
      } else {
        let votedSameAgain = false;
        for (let i = 0; i < voterIds.length; i++) {
          if (voterIds[i].includes(userId)) {
            if (i === optionIndex) votedSameAgain = true;
            voterIds[i] = voterIds[i].filter((v) => v !== userId);
          }
        }
        if (!votedSameAgain) voterIds[optionIndex].push(userId);
      }
      return { ...a, meta: { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) } };
    });
    return { ...m, attachments };
  });
}

function toggleChecklistItem(id, itemId, userId) {
  return mutate(id, (m) => ({
    ...m,
    attachments: m.attachments?.map((a) => {
      if (a.kind !== "checklist") return a;
      const items = (a.meta?.items ?? []).map((it) => {
        if (it.id !== itemId) return it;
        if (it.doneBy) {
          const { doneBy, doneAt, ...rest } = it;
          return rest;
        }
        return { ...it, doneBy: userId, doneAt: new Date().toISOString() };
      });
      return { ...a, meta: { ...a.meta, items } };
    }),
  }));
}

function addChecklistItems(id, texts, max) {
  return mutate(id, (m) => ({
    ...m,
    attachments: m.attachments?.map((a) => {
      if (a.kind !== "checklist") return a;
      const items = [...(a.meta?.items ?? [])];
      let nextId = Math.max(0, ...items.map((it) => it.id)) + 1;
      for (const text of texts) {
        if (items.length >= max) break;
        items.push({ id: nextId++, text });
      }
      return { ...a, meta: { ...a.meta, items } };
    }),
  }));
}

function retractPollVote(id, userId) {
  return mutate(id, (m) => {
    const attachments = m.attachments?.map((a) => {
      if (a.kind !== "poll" || a.meta?.closed || Number.isInteger(a.meta?.correctIndex)) return a;
      const voterIds = (a.meta?.voterIds ?? []).map((ids) => (ids ?? []).filter((v) => v !== userId));
      return { ...a, meta: { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) } };
    });
    return { ...m, attachments };
  });
}

function closePoll(id) {
  return mutate(id, (m) => ({
    ...m,
    attachments: m.attachments?.map((a) => (a.kind === "poll" ? { ...a, meta: { ...a.meta, closed: true } } : a)),
  }));
}

function incrementViews(id) {
  return mutate(id, (m) => ({ ...m, views: (m.views ?? 0) + 1 }));
}

function incrementCommentCount(id) {
  return mutate(id, (m) => ({ ...m, commentCount: (m.commentCount ?? 0) + 1 }));
}

function setAnchorForPost(id, postId) {
  return mutate(id, (m) => ({ ...m, anchorForPostId: postId }));
}

function setDiscussionAnchor(id, anchorId) {
  return mutate(id, (m) => ({ ...m, discussionAnchorId: anchorId }));
}

function attachmentBytesByKind(chatIds) {
  if (!chatIds?.length) return {};
  const holes = chatIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT json_extract(a.value, '$.kind') AS kind,
              sum(
                CASE
                  WHEN json_extract(a.value, '$.size') IS NOT NULL THEN json_extract(a.value, '$.size')
                  WHEN json_extract(a.value, '$.url') LIKE 'data:%' THEN
                    (length(json_extract(a.value, '$.url')) - instr(json_extract(a.value, '$.url'), ',')) * 3 / 4
                  ELSE 0
                END
              ) AS bytes
         FROM messages m, json_each(m.attachments) a
        WHERE m.chatId IN (${holes}) AND m.attachments IS NOT NULL AND m.attachments <> '[]'
        GROUP BY kind`
    )
    .all(...chatIds);
  return Object.fromEntries(rows.filter((r) => r.kind).map((r) => [r.kind, r.bytes ?? 0]));
}

function listMessageDays(chatId, { month, tzOffsetMinutes = 0 } = {}) {
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(datetime(createdAt, (@tz || ' minutes')), 1, 10) AS day
         FROM messages
        WHERE chatId = @chatId AND threadRootId IS NULL
          AND substr(datetime(createdAt, (@tz || ' minutes')), 1, 7) = @month
        ORDER BY day`
    )
    .all({ chatId, month, tz: tzOffsetMinutes });
  return rows.map((r) => r.day);
}

function firstMessageOfDay(chatId, { day, tzOffsetMinutes = 0 } = {}) {
  return (
    db
      .prepare(
        `SELECT id, createdAt
           FROM messages
          WHERE chatId = @chatId AND threadRootId IS NULL
            AND substr(datetime(createdAt, (@tz || ' minutes')), 1, 10) >= @day
          ORDER BY createdAt ASC
          LIMIT 1`
      )
      .get({ chatId, day, tz: tzOffsetMinutes }) ?? null
  );
}

function chatMessageStats(chatId) {
  const total = db.prepare("SELECT COUNT(*) c FROM messages WHERE chatId = ?").get(chatId).c;
  const media = db.prepare("SELECT COUNT(*) c FROM messages WHERE chatId = ? AND attachments IS NOT NULL").get(chatId).c;
  return { total, media };
}

function topSenders(chatId, limit = 10) {
  return db
    .prepare("SELECT senderId, COUNT(*) c FROM messages WHERE chatId = ? GROUP BY senderId ORDER BY c DESC LIMIT ?")
    .all(chatId, limit);
}

module.exports = {
  toggleChecklistItem,
  addChecklistItems,
  chatMessageStats,
  topSenders,
  attachmentBytesByKind,
  listMessageDays,
  firstMessageOfDay,
  rowToMessage,
  listAllMessages,
  listMediaMessages,
  listNewForBot,
  searchInChats,
  listMessages,
  listMessagesPage,
  listThreadReplies,
  getMessage,
  addMessage,
  deleteMessagesForChat,
  deleteExpiredMessages,
  editMessage,
  deleteMessage,
  deleteMessageForMe,
  togglePin,
  setKeyboard,
  toggleReaction,
  markRead,
  markChatRead,
  setReadWatermark,
  readWatermarksFor,
  votePoll,
  retractPollVote,
  closePoll,
  incrementViews,
  incrementCommentCount,
  setAnchorForPost,
  setDiscussionAnchor,
  setLinkPreview,
  updateLiveLocation,
  setAttachmentPreview,
  setReportMessageStatus,
  setBoost,
};
