const crypto = require("crypto");
const db = require("../db");

// Short, human-typeable codes (no 0/O/1/I — they're the ones people misread
// when a friend reads a referral code aloud or types it from a screenshot).
const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// "Forever" is represented as a date far enough out that it's effectively
// permanent, rather than a separate null-means-forever branch everywhere
// premiumUntil is compared against "now" — one comparison always works.
const FOREVER = "9999-01-01T00:00:00.000Z";

function rowToUser(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    phone: row.phone,
    email: row.email ?? undefined,
    passwordHash: row.passwordHash ?? undefined,
    passwordSalt: row.passwordSalt ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    bio: row.bio,
    online: !!row.online,
    lastSeen: row.lastSeen ?? undefined,
    isBot: !!row.isBot || undefined,
    blockedUserIds: JSON.parse(row.blockedUserIds),
    // Premium is a duration, not a permanent flag (see server/db.js) —
    // isPremium is always derived from premiumUntil, never trusted from its
    // own (legacy, no-longer-written-to) column.
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
    adAttachments: row.adAttachments ? JSON.parse(row.adAttachments) : [],
    birthday: row.birthday ?? undefined,
    giftsReceived: JSON.parse(row.giftsReceived ?? "[]"),
    isBanned: !!row.isBanned,
    e2ePublicKey: row.e2ePublicKey ?? undefined,
  };
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

// Usernames are case-insensitive (matches Telegram) — "Ivan" and "ivan" are
// the same handle, so lookups/uniqueness both go through lower().
async function findUserByUsername(username) {
  const normalized = (username ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return rowToUser(db.prepare("SELECT * FROM users WHERE lower(username) = ? AND username <> ''").get(normalized));
}

async function findUserByReferralCode(code) {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return undefined;
  return rowToUser(db.prepare("SELECT * FROM users WHERE referralCode = ?").get(normalized));
}

// Generates a unique 6-character referral code, retrying on the rare
// collision (checked against the DB, not just in-memory, since codes must
// stay unique across restarts).
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

const PATCHABLE_FIELDS = ["name", "username", "phone", "email", "passwordHash", "passwordSalt", "avatarColor", "avatarImage", "bio", "online", "lastSeen", "isBot", "premiumUntil", "adsUntil", "adText", "adUrl", "birthday", "e2ePublicKey"];

// Extends (or starts) a Premium period — stacks on top of remaining time if
// already active, the way a real subscription top-up would, rather than
// just resetting the clock. `days: null` grants it "forever" (see FOREVER).
async function grantPremiumDays(userId, days) {
  const user = await getUser(userId);
  if (!user) return undefined;
  // Already-forever stays forever regardless of what smaller top-up arrives
  // — there's nothing "more" than permanent to stack on top of.
  if (days == null || user.premiumForever) return updateUser(userId, { premiumUntil: FOREVER });
  const base = user.isPremium && user.premiumUntil ? new Date(user.premiumUntil) : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return updateUser(userId, { premiumUntil: base.toISOString() });
}

async function revokePremium(userId) {
  return updateUser(userId, { premiumUntil: null });
}

// Same stacking-top-up shape as grantPremiumDays above, for the ad cabinet
// (20₽/month — see server/routes/ads.js). `days: null` grants it "forever"
// (see FOREVER), same as Premium — used for the admin's own account.
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

// Real hard delete — see server/lib/deleteAccount.js for the full cascade
// (chats/sessions/contacts/bots) that has to happen alongside this so
// nothing references a row that no longer exists.
async function deleteUser(id) {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

async function updateUser(id, patch) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) return undefined;
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

async function listReferrals(userId) {
  return db.prepare("SELECT * FROM users WHERE referredBy = ?").all(userId).map(rowToUser);
}

async function setBanned(userId, banned) {
  db.prepare("UPDATE users SET isBanned = ? WHERE id = ?").run(banned ? 1 : 0, userId);
  return getUser(userId);
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

// Appends to the gift shelf shown on a user's public profile — called once a
// gift actually /deliver's (server/routes/gifts.js), not when it's merely
// requested, so the shelf only ever shows gifts that really landed.
async function addReceivedGift(userId, gift) {
  const row = db.prepare("SELECT giftsReceived FROM users WHERE id = ?").get(userId);
  if (!row) return undefined;
  const current = JSON.parse(row.giftsReceived ?? "[]");
  current.push(gift);
  db.prepare("UPDATE users SET giftsReceived = ? WHERE id = ?").run(JSON.stringify(current), userId);
  return getUser(userId);
}

module.exports = {
  listUsers,
  getUser,
  findUserByEmail,
  findUserByPhone,
  findUserByUsername,
  findUserByReferralCode,
  generateReferralCode,
  listReferrals,
  createUser,
  updateUser,
  setBlocked,
  setBanned,
  addReceivedGift,
  grantPremiumDays,
  revokePremium,
  grantAdsDays,
  revokeAds,
  deleteUser,
};
