const db = require("../db");
const { createHash } = require("crypto");
const { newSecretChatKey } = require("../lib/textCrypto");

function rowToChat(row, members) {
  if (!row) return undefined;
  if (!members) {
    members = db.prepare("SELECT userId, isAdmin, isModerator, isOwner FROM chat_members WHERE chatId = ?").all(row.id);
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    username: row.username ?? undefined,
    isPublic: !!row.isPublic || undefined,
    isVerified: !!row.isVerified || undefined,
    inviteCode: row.inviteCode ?? undefined,
    approveJoins: !!row.approveJoins || undefined,
    signMessages: !!row.signMessages || undefined,
    anonymousAdmins: !!row.anonymousAdmins || undefined,
    permissions: row.permissions ? JSON.parse(row.permissions) : null,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    ownerId: row.ownerId ?? undefined,
    adminIds: members.filter((m) => m.isAdmin).map((m) => m.userId),
    moderatorIds: members.filter((m) => m.isModerator).map((m) => m.userId),
    ownerIds: members.filter((m) => m.isOwner).map((m) => m.userId),
    memberTitles: row.memberTitles ? JSON.parse(row.memberTitles) : {},
    memberIds: members.map((m) => m.userId),
    pinned: !!row.pinned,
    muted: !!row.muted || (!!row.mutedUntil && row.mutedUntil > new Date().toISOString()),
    mutedUntil: row.mutedUntil ?? undefined,
    slowModeSeconds: row.slowModeSeconds ?? undefined,
    commentPriceStars: row.commentPriceStars ?? 0,
    archived: !!row.archived,
    createdAt: row.createdAt,
    linkedDiscussionChatId: row.linkedDiscussionChatId ?? undefined,
    wallpaper: row.wallpaper ? JSON.parse(row.wallpaper) : null,
    allowedReactions: row.allowedReactions ? JSON.parse(row.allowedReactions) : null,
    restrictions: row.restrictions ? JSON.parse(row.restrictions) : {},
    warnings: row.warnings ? JSON.parse(row.warnings) : {},
    bannedIds: row.bannedIds ? JSON.parse(row.bannedIds) : [],
    rules: row.rules ?? undefined,
    topicsEnabled: !!row.topicsEnabled || undefined,
    welcomeText: row.welcomeText ?? undefined,
    protectedBy: row.protectedBy ? JSON.parse(row.protectedBy) : [],
    points: row.points ?? 0,
    votes: row.votes ? JSON.parse(row.votes) : {},
    autoDeleteSeconds: row.autoDeleteSeconds ?? undefined,
    // Ни ключ, ни привязку к устройствам наружу не отдаём: device_id — часть
    // авторизации (middleware/auth.js), а ключ нужен только data/messages.js.
    secret: !!row.secret || undefined,
  };
}

// Один запрос на все чаты вместо запроса на каждый: список чатов грузится
// заметно быстрее, когда у пользователя их много.
const MEMBERS_CHUNK = 500;
function membersByChat(ids) {
  const byChat = new Map();
  for (let i = 0; i < ids.length; i += MEMBERS_CHUNK) {
    const chunk = ids.slice(i, i + MEMBERS_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT chatId, userId, isAdmin, isModerator, isOwner FROM chat_members WHERE chatId IN (${placeholders})`)
      .all(...chunk);
    for (const m of rows) {
      let list = byChat.get(m.chatId);
      if (!list) byChat.set(m.chatId, (list = []));
      list.push(m);
    }
  }
  return byChat;
}

async function listChats() {
  const rows = db.prepare("SELECT * FROM chats").all();
  const byChat = membersByChat(rows.map((r) => r.id));
  return rows.map((r) => rowToChat(r, byChat.get(r.id) ?? []));
}

async function findDmBetween(userIdA, userIdB) {
  const row =
    userIdA === userIdB
      ? db
          .prepare(
            `SELECT c.* FROM chats c
               JOIN chat_members m ON m.chatId = c.id AND m.userId = ?
              WHERE c.type = 'dm' AND c.secret = 0
                AND (SELECT COUNT(*) FROM chat_members x WHERE x.chatId = c.id) = 1
              LIMIT 1`
          )
          .get(userIdA)
      : db
          .prepare(
            `SELECT c.* FROM chats c
               JOIN chat_members a ON a.chatId = c.id AND a.userId = ?
               JOIN chat_members b ON b.chatId = c.id AND b.userId = ?
              WHERE c.type = 'dm' AND c.secret = 0
              LIMIT 1`
          )
          .get(userIdA, userIdB);
  return rowToChat(row);
}

// deviceId — скрыть секретные чаты, привязанные к другому устройству этого пользователя.
async function listChatsForUser(userId, { deviceId } = {}) {
  const rows = db
    .prepare("SELECT c.* FROM chats c JOIN chat_members m ON m.chatId = c.id WHERE m.userId = ?")
    .all(userId);
  const byChat = membersByChat(rows.map((r) => r.id));
  const chats = rows.map((r) => rowToChat(r, byChat.get(r.id) ?? []));
  if (deviceId === undefined) return chats;
  const hash = deviceHash(deviceId);
  return chats.filter((c) => {
    const bound = c.secret ? secretDeviceOf(c.id, userId) : null;
    return !bound || bound === hash;
  });
}

async function getChat(id) {
  return rowToChat(db.prepare("SELECT * FROM chats WHERE id = ?").get(id));
}

async function findChatByInviteCode(code) {
  const c = String(code ?? "").trim();
  if (!c) return undefined;
  return rowToChat(db.prepare("SELECT * FROM chats WHERE inviteCode = ?").get(c));
}

async function findChatByUsername(username) {
  const normalized = (username ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return rowToChat(db.prepare("SELECT * FROM chats WHERE lower(username) = ? AND username IS NOT NULL").get(normalized));
}

async function findChannelByDiscussionChatId(discussionChatId) {
  if (!discussionChatId) return undefined;
  return rowToChat(db.prepare("SELECT * FROM chats WHERE linkedDiscussionChatId = ? AND type = 'channel'").get(discussionChatId));
}

async function searchPublicChannels(query) {
  const q = (query ?? "").trim().toLowerCase();
  const handle = q.replace(/^@/, "");
  const rows = db
    .prepare("SELECT * FROM chats WHERE type IN ('channel', 'group') AND isPublic = 1 ORDER BY title ASC")
    .all();
  const filtered = rows
    .filter((r) => !q || (r.title ?? "").toLowerCase().includes(q) || (r.username ?? "").toLowerCase().includes(handle))
    .slice(0, 50);
  const byChat = membersByChat(filtered.map((r) => r.id));
  return filtered.map((r) => rowToChat(r, byChat.get(r.id) ?? []));
}

// Похожие каналы, как в Telegram: публичные каналы, на которые чаще всего
// подписаны подписчики этого. Если пересечений мало — добиваем самыми
// крупными публичными каналами.
const similarByAudience = db.prepare(`
  SELECT m2.chatId AS id, COUNT(*) AS overlap
  FROM (SELECT userId FROM chat_members WHERE chatId = @chatId LIMIT 5000) m1
  JOIN chat_members m2 ON m2.userId = m1.userId AND m2.chatId != @chatId
  JOIN chats c ON c.id = m2.chatId AND c.type = 'channel' AND c.isPublic = 1
  GROUP BY m2.chatId
  ORDER BY overlap DESC
  LIMIT @limit
`);
const popularChannels = db.prepare(`
  SELECT c.id AS id, (SELECT COUNT(*) FROM chat_members m WHERE m.chatId = c.id) AS members
  FROM chats c
  WHERE c.type = 'channel' AND c.isPublic = 1 AND c.id != @chatId
  ORDER BY members DESC
  LIMIT @limit
`);

async function similarChannels(chatId, limit = 10) {
  const ids = similarByAudience.all({ chatId, limit }).map((r) => r.id);
  if (ids.length < limit) {
    for (const r of popularChannels.all({ chatId, limit: limit * 2 })) {
      if (ids.length >= limit) break;
      if (!ids.includes(r.id)) ids.push(r.id);
    }
  }
  const chats = await Promise.all(ids.map((id) => getChat(id)));
  return chats.filter(Boolean);
}

const setMembers = db.transaction((chatId, memberIds, adminIds, moderatorIds, ownerIds) => {
  db.prepare("DELETE FROM chat_members WHERE chatId = ?").run(chatId);
  const insert = db.prepare("INSERT INTO chat_members (chatId, userId, isAdmin, isModerator, isOwner) VALUES (?, ?, ?, ?, ?)");
  for (const userId of new Set((memberIds ?? []).filter(Boolean))) {
    insert.run(
      chatId,
      userId,
      adminIds?.includes(userId) ? 1 : 0,
      moderatorIds?.includes(userId) ? 1 : 0,
      ownerIds?.includes(userId) ? 1 : 0
    );
  }
});

async function createChat(chat) {
  db.prepare(
    `INSERT INTO chats (id, type, title, description, username, isPublic, avatarColor, avatarImage, ownerId, pinned, muted, archived, createdAt, linkedDiscussionChatId, restrictions, points, votes)
     VALUES (@id, @type, @title, @description, @username, @isPublic, @avatarColor, @avatarImage, @ownerId, @pinned, @muted, @archived, @createdAt, @linkedDiscussionChatId, @restrictions, @points, @votes)`
  ).run({
    id: chat.id,
    type: chat.type,
    title: chat.title ?? "",
    description: chat.description ?? null,
    username: chat.username ?? null,
    isPublic: chat.isPublic ? 1 : 0,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    ownerId: chat.ownerId ?? null,
    pinned: chat.pinned ? 1 : 0,
    muted: chat.muted ? 1 : 0,
    archived: chat.archived ? 1 : 0,
    createdAt: chat.createdAt,
    linkedDiscussionChatId: chat.linkedDiscussionChatId ?? null,
    restrictions: chat.restrictions ? JSON.stringify(chat.restrictions) : null,
    points: chat.points ?? 0,
    votes: chat.votes ? JSON.stringify(chat.votes) : null,
  });
  setMembers(chat.id, chat.memberIds ?? [], chat.adminIds ?? [], chat.moderatorIds ?? [], chat.ownerIds ?? (chat.ownerId ? [chat.ownerId] : []));
  if (chat.secret) {
    db.prepare("UPDATE chats SET secret = 1, secretKey = ?, secretDevices = ? WHERE id = ?").run(
      newSecretChatKey(chat.id),
      JSON.stringify(Object.fromEntries(Object.entries(chat.secretDevices ?? {}).map(([uid, dev]) => [uid, deviceHash(dev)]))),
      chat.id
    );
  }
  return getChat(chat.id);
}

// Секретный чат живёт на одном устройстве каждого участника, как в Telegram:
// у создателя — где создан, у собеседника — где он открыл его первым.
// null — чат не секретный или участник ещё не выбрал устройство.
// В базе — только хеш device_id: утечка таблицы не даёт подделать вход.
function deviceHash(deviceId) {
  return deviceId ? createHash("sha256").update(`secret-chat-device:${deviceId}`).digest("hex").slice(0, 32) : null;
}

function secretDevicesOf(chatId) {
  const row = db.prepare("SELECT secret, secretDevices FROM chats WHERE id = ?").get(chatId);
  return row?.secret ? JSON.parse(row.secretDevices || "{}") : null;
}

// Хеш устройства, к которому привязан чат у этого участника (null — не привязан).
function secretDeviceOf(chatId, userId) {
  return secretDevicesOf(chatId)?.[userId] ?? null;
}

function isSecretChat(chatId) {
  return !!db.prepare("SELECT secret FROM chats WHERE id = ?").get(chatId)?.secret;
}

// Привязывает устройство, если ещё не привязано. true — чат доступен с этого устройства.
const claimSecretDevice = db.transaction((chatId, userId, deviceId) => {
  const row = db.prepare("SELECT secret, secretDevices FROM chats WHERE id = ?").get(chatId);
  if (!row?.secret) return true;
  if (!deviceId) return false;
  const devices = JSON.parse(row.secretDevices || "{}");
  const hash = deviceHash(deviceId);
  if (devices[userId]) return devices[userId] === hash;
  devices[userId] = hash;
  db.prepare("UPDATE chats SET secretDevices = ? WHERE id = ?").run(JSON.stringify(devices), chatId);
  return true;
});

const PATCHABLE_FIELDS = [
  "type", "title", "description", "username", "isPublic", "avatarColor", "avatarImage",
  "ownerId", "pinned", "muted", "archived", "createdAt", "linkedDiscussionChatId", "points",
  "autoDeleteSeconds", "isVerified", "inviteCode", "mutedUntil", "slowModeSeconds", "commentPriceStars",
  "approveJoins", "signMessages", "rules", "anonymousAdmins", "topicsEnabled", "welcomeText",
];

async function updateChat(id, patch) {
  const existing = db.prepare("SELECT id FROM chats WHERE id = ?").get(id);
  if (!existing) return undefined;

  const fields = Object.keys(patch).filter((k) => PATCHABLE_FIELDS.includes(k));
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
    const values = {};
    for (const f of fields) {
      const v = patch[f];
      values[f] = typeof v === "boolean" ? (v ? 1 : 0) : v ?? null;
    }
    db.prepare(`UPDATE chats SET ${setClause} WHERE id = @id`).run({ ...values, id });
  }
  if ("memberIds" in patch || "adminIds" in patch || "moderatorIds" in patch || "ownerIds" in patch) {
    const current = rowToChat(db.prepare("SELECT * FROM chats WHERE id = ?").get(id));
    setMembers(
      id,
      patch.memberIds ?? current.memberIds,
      patch.adminIds ?? current.adminIds,
      patch.moderatorIds ?? current.moderatorIds,
      patch.ownerIds ?? current.ownerIds
    );
  }
  if ("permissions" in patch) {
    db.prepare("UPDATE chats SET permissions = ? WHERE id = ?").run(
      patch.permissions ? JSON.stringify(patch.permissions) : null,
      id
    );
  }
  if ("memberTitles" in patch) {
    db.prepare("UPDATE chats SET memberTitles = ? WHERE id = ?").run(JSON.stringify(patch.memberTitles ?? {}), id);
  }
  if ("restrictions" in patch) {
    db.prepare("UPDATE chats SET restrictions = ? WHERE id = ?").run(JSON.stringify(patch.restrictions ?? {}), id);
  }
  if ("votes" in patch) {
    db.prepare("UPDATE chats SET votes = ? WHERE id = ?").run(JSON.stringify(patch.votes ?? {}), id);
  }
  if ("warnings" in patch) {
    db.prepare("UPDATE chats SET warnings = ? WHERE id = ?").run(JSON.stringify(patch.warnings ?? {}), id);
  }
  if ("protectedBy" in patch) {
    const list = Array.isArray(patch.protectedBy) && patch.protectedBy.length ? JSON.stringify(patch.protectedBy) : null;
    db.prepare("UPDATE chats SET protectedBy = ? WHERE id = ?").run(list, id);
  }
  if ("bannedIds" in patch) {
    db.prepare("UPDATE chats SET bannedIds = ? WHERE id = ?").run(JSON.stringify(patch.bannedIds ?? []), id);
  }
  if ("wallpaper" in patch) {
    db.prepare("UPDATE chats SET wallpaper = ? WHERE id = ?").run(
      patch.wallpaper ? JSON.stringify(patch.wallpaper) : null,
      id
    );
  }
  if ("allowedReactions" in patch) {
    db.prepare("UPDATE chats SET allowedReactions = ? WHERE id = ?").run(
      Array.isArray(patch.allowedReactions) ? JSON.stringify(patch.allowedReactions) : null,
      id
    );
  }
  return getChat(id);
}

async function deleteChat(id) {
  db.prepare("DELETE FROM chats WHERE id = ?").run(id);
}

module.exports = {
  secretDeviceOf, deviceHash, isSecretChat, claimSecretDevice,
  findChatByInviteCode, listChats, listChatsForUser, findDmBetween, getChat, updateChat, createChat, deleteChat, findChatByUsername, searchPublicChannels, similarChannels, findChannelByDiscussionChatId };
