const crypto = require("crypto");
const db = require("../db");
const { parseList, mainImage } = require("../lib/avatars");

const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const FOREVER = "9999-01-01T00:00:00.000Z";

function rowToUser(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    lastName: row.lastName ?? undefined,
    username: row.username,
    phone: row.phone,
    email: row.email ?? undefined,
    passwordHash: row.passwordHash ?? undefined,
    passwordSalt: row.passwordSalt ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    avatarImages: parseList(row.avatarImages),
    bio: row.bio,
    online: !!row.online,
    lastSeen: row.lastSeen ?? undefined,
    isBot: !!row.isBot || undefined,
    blockedUserIds: JSON.parse(row.blockedUserIds),
    isPremium: !!row.premiumUntil && row.premiumUntil > new Date().toISOString(),
    premiumUntil: row.premiumUntil && row.premiumUntil !== FOREVER ? row.premiumUntil : undefined,
    premiumForever: row.premiumUntil === FOREVER || undefined,
    referralCode: row.referralCode ?? undefined,
    referredBy: row.referredBy ?? undefined,
    isAdsActive: !!row.adsUntil && row.adsUntil > new Date().toISOString(),
    adsUntil: row.adsUntil && row.adsUntil !== FOREVER ? row.adsUntil : undefined,
    adsForever: row.adsUntil === FOREVER || undefined,
    adText: row.adText ?? undefined,
    adUrl: row.adUrl ?? undefined,
    isBusiness: !!row.businessUntil && row.businessUntil > new Date().toISOString(),
    businessUntil: row.businessUntil && row.businessUntil !== FOREVER ? row.businessUntil : undefined,
    businessForever: row.businessUntil === FOREVER || undefined,
    businessAddress: row.businessAddress ?? undefined,
    businessLat: row.businessLat ?? undefined,
    businessLng: row.businessLng ?? undefined,
    nameColor: row.nameColor ?? undefined,
    adAttachments: row.adAttachments ? JSON.parse(row.adAttachments) : [],
    birthday: row.birthday ?? undefined,
    giftsReceived: JSON.parse(row.giftsReceived ?? "[]"),
    isBanned: !!row.isBanned,
    stars: row.stars ?? 0,
    messagePriceStars: row.messagePriceStars ?? 0,
    statusIcon: (() => {
      if (!row.activeStatusId) return null;
      try {
        return JSON.parse(row.statusItems ?? "[]").find((i) => i.id === row.activeStatusId)?.image ?? null;
      } catch {
        return null;
      }
    })(),
    statusName: (() => {
      if (!row.activeStatusId) return null;
      try {
        return JSON.parse(row.statusItems ?? "[]").find((i) => i.id === row.activeStatusId)?.name || null;
      } catch {
        return null;
      }
    })(),
    banReason: row.banReason ?? undefined,
    bannedAt: row.bannedAt ?? undefined,
    adminSections: row.adminSections ? JSON.parse(row.adminSections) : [],
    profileTrack: row.profileTrack ? JSON.parse(row.profileTrack) : null,
    safetyLabel: row.safetyLabel ?? undefined,
    isVerified: !!row.isVerified || undefined,
    usernameAuctionId: row.usernameAuctionId ?? undefined,
    isCollectibleUsername: !!row.usernameAuctionId || undefined,
    safetyLabelAt: row.safetyLabelAt ?? undefined,
    totpSecret: row.totpSecret ?? undefined,
    totpEnabledAt: row.totpEnabledAt ?? undefined,
    totpRecoveryCodes: row.totpRecoveryCodes ? JSON.parse(row.totpRecoveryCodes) : [],
    twoFactorMethod: row.twoFactorMethod ?? "totp",
    twoFactorEnabled:
      row.twoFactorMethod === "password"
        ?
          !!(row.cloudPasswordHash && row.cloudPasswordSalt)
        : row.twoFactorMethod === "chat"
          ? !!row.totpEnabledAt
          : !!(row.totpSecret && row.totpEnabledAt),
    cloudPasswordHash: row.cloudPasswordHash ?? undefined,
    cloudPasswordSalt: row.cloudPasswordSalt ?? undefined,
    cloudPasswordHint: row.cloudPasswordHint ?? "",
  };
}

async function listUsersByIds(ids) {
  const unique = [...new Set(ids ?? [])].filter(Boolean);
  if (!unique.length) return [];
  const ph = unique.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM users WHERE id IN (${ph})`).all(...unique).map(rowToUser);
}

function listUserNamesByIds(ids) {
  const unique = [...new Set(ids ?? [])].filter(Boolean);
  if (!unique.length) return [];
  const ph = unique.map(() => "?").join(",");
  return db.prepare(`SELECT id, name, username FROM users WHERE id IN (${ph})`).all(...unique);
}

async function searchUsers(query, { limit = 40 } = {}) {
  const q = String(query ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  return db
    .prepare(
      `SELECT * FROM users
        WHERE (lower_ru(name) LIKE ? ESCAPE '\\' OR LOWER(username) LIKE ? ESCAPE '\\')
          AND COALESCE(isBanned, 0) = 0
        LIMIT ?`
    )
    .all(like, like, limit * 3)
    .map(rowToUser);
}

async function listUsers() {
  return db.prepare("SELECT * FROM users").all().map(rowToUser);
}

async function getUser(id) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return rowToUser(db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(normalized));
}

async function findUserByPhone(phone) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE phone = ? AND phone <> ''").get((phone ?? "").trim()));
}

async function findUserByUsername(username) {
  const normalized = (username ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return rowToUser(db.prepare("SELECT * FROM users WHERE lower(username) = ? AND username <> ''").get(normalized));
}

function findUserIdsByUsernames(usernames) {
  const list = [...new Set((usernames ?? []).map((u) => String(u ?? "").trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return [];
  const holes = list.map(() => "?").join(",");
  return db
    .prepare(`SELECT id, username FROM users WHERE lower(username) IN (${holes}) AND username <> ''`)
    .all(...list);
}

async function findUserByReferralCode(code) {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return undefined;
  return rowToUser(db.prepare("SELECT * FROM users WHERE referralCode = ?").get(normalized));
}

function generateReferralCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i++) code += REFERRAL_ALPHABET[crypto.randomInt(REFERRAL_ALPHABET.length)];
    const exists = db.prepare("SELECT 1 FROM users WHERE referralCode = ?").get(code);
    if (!exists) return code;
  }
}

async function createUser(user) {
  db.prepare(
    `INSERT INTO users (id, name, username, phone, email, passwordHash, passwordSalt, avatarColor, avatarImage, bio, online, lastSeen, isBot, blockedUserIds, referralCode, referredBy, premiumUntil)
     VALUES (@id, @name, @username, @phone, @email, @passwordHash, @passwordSalt, @avatarColor, @avatarImage, @bio, @online, @lastSeen, @isBot, @blockedUserIds, @referralCode, @referredBy, @premiumUntil)`
  ).run({
    id: user.id,
    name: user.name ?? "",
    username: user.username ?? "",
    phone: user.phone ?? "",
    email: user.email ?? null,
    passwordHash: user.passwordHash ?? null,
    passwordSalt: user.passwordSalt ?? null,
    avatarColor: user.avatarColor ?? null,
    avatarImage: user.avatarImage ?? null,
    bio: user.bio ?? "",
    online: user.online ? 1 : 0,
    lastSeen: user.lastSeen ?? null,
    isBot: user.isBot ? 1 : 0,
    blockedUserIds: JSON.stringify(user.blockedUserIds ?? []),
    referralCode: user.referralCode ?? generateReferralCode(),
    referredBy: user.referredBy ?? null,
    premiumUntil: user.premiumUntil ?? null,
  });
  return getUser(user.id);
}

const PATCHABLE_FIELDS = ["name", "lastName", "username", "phone", "email", "passwordHash", "passwordSalt", "cloudPasswordHash", "cloudPasswordSalt", "cloudPasswordHint", "twoFactorMethod", "avatarColor", "avatarImage", "bio", "usernameAuctionId", "online", "lastSeen", "isBot", "premiumUntil", "adsUntil", "adText", "adUrl", "birthday", "businessUntil", "businessAddress", "businessLat", "businessLng", "nameColor"];

async function grantPremiumDays(userId, days) {
  const user = await getUser(userId);
  if (!user) return undefined;
  if (days == null || user.premiumForever) return updateUser(userId, { premiumUntil: FOREVER });
  const base = user.isPremium && user.premiumUntil ? new Date(user.premiumUntil) : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return updateUser(userId, { premiumUntil: base.toISOString() });
}

async function revokePremium(userId) {
  return updateUser(userId, { premiumUntil: null });
}

async function grantAdsDays(userId, days) {
  const user = await getUser(userId);
  if (!user) return undefined;
  if (days == null || user.adsForever) return updateUser(userId, { adsUntil: FOREVER });
  const base = user.isAdsActive && user.adsUntil ? new Date(user.adsUntil) : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return updateUser(userId, { adsUntil: base.toISOString() });
}

async function revokeAds(userId) {
  return updateUser(userId, { adsUntil: null });
}

async function grantBusinessDays(userId, days) {
  const user = await getUser(userId);
  if (!user) return undefined;
  if (days == null || user.businessForever) return updateUser(userId, { businessUntil: FOREVER });
  const base = user.isBusiness && user.businessUntil ? new Date(user.businessUntil) : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return updateUser(userId, { businessUntil: base.toISOString() });
}

async function revokeBusiness(userId) {
  return updateUser(userId, { businessUntil: null });
}

async function deleteUser(id) {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

async function updateUser(id, patch) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) return undefined;
  if ("username" in patch && !("usernameAuctionId" in patch)) {
    db.prepare("UPDATE users SET usernameAuctionId = NULL WHERE id = ?").run(id);
  }
  const fields = Object.keys(patch).filter((k) => PATCHABLE_FIELDS.includes(k));
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
    const values = {};
    for (const f of fields) {
      const v = patch[f];
      values[f] = typeof v === "boolean" ? (v ? 1 : 0) : v ?? null;
    }
    db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...values, id });
  }
  if ("blockedUserIds" in patch) {
    db.prepare("UPDATE users SET blockedUserIds = ? WHERE id = ?").run(JSON.stringify(patch.blockedUserIds ?? []), id);
  }
  if ("adAttachments" in patch) {
    db.prepare("UPDATE users SET adAttachments = ? WHERE id = ?").run(JSON.stringify(patch.adAttachments ?? []), id);
  }
  return getUser(id);
}

async function setAvatars(userId, list) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) return undefined;
  db.prepare("UPDATE users SET avatarImages = ?, avatarImage = ? WHERE id = ?").run(
    JSON.stringify(list),
    mainImage(list),
    userId
  );
  return getUser(userId);
}

async function setProfileTrack(userId, track) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) return undefined;
  db.prepare("UPDATE users SET profileTrack = ? WHERE id = ?").run(track ? JSON.stringify(track) : null, userId);
  return getUser(userId);
}

function getStatusState(userId) {
  const row = db.prepare("SELECT statusItems, activeStatusId FROM users WHERE id = ?").get(userId);
  if (!row) return undefined;
  let items;
  try {
    items = JSON.parse(row.statusItems ?? "[]");
  } catch {
    items = [];
  }
  return { items, activeStatusId: row.activeStatusId ?? null };
}

async function setStatusState(userId, items, activeStatusId) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) return undefined;
  db.prepare("UPDATE users SET statusItems = ?, activeStatusId = ? WHERE id = ?").run(
    JSON.stringify(items),
    activeStatusId ?? null,
    userId
  );
  return getUser(userId);
}

async function listReferrals(userId) {
  return db.prepare("SELECT * FROM users WHERE referredBy = ?").all(userId).map(rowToUser);
}

function listUsersWithBirthdayToday() {
  return db
    .prepare(`SELECT * FROM users WHERE birthday IS NOT NULL AND strftime('%m-%d', birthday) = strftime('%m-%d', 'now')`)
    .all()
    .map(rowToUser);
}

async function setBanned(userId, banned, reason) {
  if (banned) {
    db.prepare("UPDATE users SET isBanned = 1, banReason = ?, bannedAt = ? WHERE id = ?").run(
      (reason ?? "").trim() || null,
      new Date().toISOString(),
      userId
    );
  } else {
    db.prepare("UPDATE users SET isBanned = 0, banReason = NULL, bannedAt = NULL WHERE id = ?").run(userId);
  }
  return getUser(userId);
}

async function startTotpSetup(userId, secret) {
  db.prepare("UPDATE users SET totpSecret = ?, totpEnabledAt = NULL, totpRecoveryCodes = NULL, twoFactorMethod = 'totp' WHERE id = ?").run(secret, userId);
  return getUser(userId);
}

async function startChatTwoFactor(userId) {
  db.prepare("UPDATE users SET totpSecret = NULL, totpEnabledAt = NULL, totpRecoveryCodes = NULL, twoFactorMethod = 'chat' WHERE id = ?").run(userId);
  return getUser(userId);
}

async function enableTotp(userId, recoveryCodeHashes) {
  db.prepare("UPDATE users SET totpEnabledAt = ?, totpRecoveryCodes = ? WHERE id = ?").run(
    new Date().toISOString(),
    JSON.stringify(recoveryCodeHashes ?? []),
    userId
  );
  return getUser(userId);
}

async function disableTotp(userId) {
  db.prepare("UPDATE users SET totpSecret = NULL, totpEnabledAt = NULL, totpRecoveryCodes = NULL, twoFactorMethod = NULL WHERE id = ?").run(userId);
  return getUser(userId);
}

async function consumeRecoveryCode(userId, hash) {
  const user = await getUser(userId);
  if (!user) return false;
  const codes = user.totpRecoveryCodes ?? [];
  const idx = codes.indexOf(hash);
  if (idx === -1) return false;
  const remaining = codes.filter((_, i) => i !== idx);
  db.prepare("UPDATE users SET totpRecoveryCodes = ? WHERE id = ?").run(JSON.stringify(remaining), userId);
  return true;
}

async function listBannedUsers() {
  return db.prepare("SELECT * FROM users WHERE isBanned = 1 ORDER BY bannedAt DESC").all().map(rowToUser);
}

async function setVerified(userId, verified) {
  db.prepare("UPDATE users SET isVerified = ? WHERE id = ?").run(verified ? 1 : 0, userId);
  return getUser(userId);
}

async function setAdminSections(userId, sections) {
  const valid = Array.isArray(sections) ? [...new Set(sections.filter((s) => typeof s === "string"))] : [];
  db.prepare("UPDATE users SET adminSections = ? WHERE id = ?").run(JSON.stringify(valid), userId);
  return getUser(userId);
}

async function setSafetyLabel(userId, label) {
  db.prepare("UPDATE users SET safetyLabel = ?, safetyLabelAt = ? WHERE id = ?").run(
    label || null,
    label ? new Date().toISOString() : null,
    userId
  );
  return getUser(userId);
}

async function listLabeledUsers() {
  return db.prepare("SELECT * FROM users WHERE safetyLabel IS NOT NULL ORDER BY safetyLabelAt DESC").all().map(rowToUser);
}

async function setBlocked(userId, targetId, blocked) {
  const row = db.prepare("SELECT blockedUserIds FROM users WHERE id = ?").get(userId);
  if (!row) return undefined;
  const current = new Set(JSON.parse(row.blockedUserIds));
  if (blocked) current.add(targetId);
  else current.delete(targetId);
  db.prepare("UPDATE users SET blockedUserIds = ? WHERE id = ?").run(JSON.stringify([...current]), userId);
  return getUser(userId);
}

async function addReceivedGift(userId, gift) {
  const row = db.prepare("SELECT giftsReceived FROM users WHERE id = ?").get(userId);
  if (!row) return undefined;
  const current = JSON.parse(row.giftsReceived ?? "[]");
  current.push({ id: `rg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`, ...gift });
  db.prepare("UPDATE users SET giftsReceived = ? WHERE id = ?").run(JSON.stringify(current), userId);
  return getUser(userId);
}

const setGiftPinned = db.transaction((userId, giftEntryId, pinned) => {
  const row = db.prepare("SELECT giftsReceived FROM users WHERE id = ?").get(userId);
  if (!row) return false;
  const current = JSON.parse(row.giftsReceived ?? "[]");
  const idx = current.findIndex((g) => (g.id ? g.id === giftEntryId : `${g.emoji}|${g.at}` === giftEntryId));
  if (idx === -1) return false;
  if (pinned) current[idx].pinned = true;
  else delete current[idx].pinned;
  db.prepare("UPDATE users SET giftsReceived = ? WHERE id = ?").run(JSON.stringify(current), userId);
  return true;
});

const removeReceivedGift = db.transaction((userId, giftEntryId) => {
  const row = db.prepare("SELECT giftsReceived FROM users WHERE id = ?").get(userId);
  if (!row) return false;
  const current = JSON.parse(row.giftsReceived ?? "[]");
  const idx = current.findIndex((g) => (g.id ? g.id === giftEntryId : `${g.emoji}|${g.at}` === giftEntryId));
  if (idx === -1) return false;
  current.splice(idx, 1);
  db.prepare("UPDATE users SET giftsReceived = ? WHERE id = ?").run(JSON.stringify(current), userId);
  return true;
});

function scheduleAccountDeletion(userId, iso) {
  return db.prepare("UPDATE users SET scheduledDeletionAt = ? WHERE id = ?").run(iso, userId).changes > 0;
}
function cancelAccountDeletion(userId) {
  const row = db.prepare("SELECT scheduledDeletionAt FROM users WHERE id = ?").get(userId);
  if (!row || !row.scheduledDeletionAt) return false;
  db.prepare("UPDATE users SET scheduledDeletionAt = NULL WHERE id = ?").run(userId);
  return true;
}
function listAccountsDueForDeletion(nowIso) {
  return db
    .prepare("SELECT id FROM users WHERE scheduledDeletionAt IS NOT NULL AND scheduledDeletionAt <= ?")
    .all(nowIso)
    .map((r) => r.id);
}

module.exports = {
  listUserNamesByIds,
  scheduleAccountDeletion,
  cancelAccountDeletion,
  listAccountsDueForDeletion,
  setAvatars,
  getStatusState,
  setStatusState,
  setVerified,
  setAdminSections,
  setGiftPinned,
  setProfileTrack,
  listUsers,
  listUsersByIds,
  searchUsers,
  getUser,
  findUserByEmail,
  findUserByPhone,
  findUserByUsername,
  findUserIdsByUsernames,
  findUserByReferralCode,
  generateReferralCode,
  listReferrals,
  listUsersWithBirthdayToday,
  createUser,
  updateUser,
  setBlocked,
  setBanned,
  startTotpSetup,
  startChatTwoFactor,
  enableTotp,
  disableTotp,
  consumeRecoveryCode,
  listBannedUsers,
  setSafetyLabel,
  listLabeledUsers,
  addReceivedGift,
  removeReceivedGift,
  grantPremiumDays,
  revokePremium,
  grantAdsDays,
  revokeAds,
  grantBusinessDays,
  revokeBusiness,
  deleteUser,
};
