const crypto = require("crypto");
const db = require("../db");
const { parseList, mainImage } = require("../lib/avatars");

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
    // The full list behind the avatar circle (lib/avatars.js). avatarImage
    // above stays the current one's still, so nothing that only wants "a
    // picture for this person" has to know this exists.
    avatarImages: parseList(row.avatarImages),
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
    // Stars balance and the price this account charges strangers per DM
    // (server/data/stars.js). The balance is stripped for everyone but the
    // account itself — see data/sanitize.js.
    stars: row.stars ?? 0,
    messagePriceStars: row.messagePriceStars ?? 0,
    banReason: row.banReason ?? undefined,
    bannedAt: row.bannedAt ?? undefined,
    safetyLabel: row.safetyLabel ?? undefined,
    isVerified: !!row.isVerified || undefined,
    // Set only by the auction (routes/usernames.js) and cleared whenever the
    // handle changes — a collectible mark that outlived its handle would be a
    // lie about a name somebody else now holds.
    usernameAuctionId: row.usernameAuctionId ?? undefined,
    isCollectibleUsername: !!row.usernameAuctionId || undefined,
    safetyLabelAt: row.safetyLabelAt ?? undefined,
    // 2FA (server/lib/totp.js). twoFactorEnabled is derived, never stored — a
    // secret that was generated but never confirmed with a real code must not
    // count as enabled, or a half-finished setup would lock the account out.
    totpSecret: row.totpSecret ?? undefined,
    totpEnabledAt: row.totpEnabledAt ?? undefined,
    totpRecoveryCodes: row.totpRecoveryCodes ? JSON.parse(row.totpRecoveryCodes) : [],
    // "chat" needs no secret — the code is generated per attempt and delivered
    // through the Shalter service chat — so "enabled" can't be defined by the
    // presence of a secret alone.
    twoFactorMethod: row.twoFactorMethod ?? "totp",
    twoFactorEnabled: row.twoFactorMethod === "chat" ? !!row.totpEnabledAt : !!(row.totpSecret && row.totpEnabledAt),
  };
}

// Только нужные люди, а не вся таблица.
//
// Повод: у каждой строки users лежит аватар — картинка, закодированная прямо в
// поле (data:-URL, десятки килобайт). listUsers() читает их все, и «открыть
// чат» на сервере с тысячей аккаунтов означало прочитать и разобрать тысячу
// картинок ради имён пяти участников. Здесь читаются ровно те строки, что
// нужны.
async function listUsersByIds(ids) {
  const unique = [...new Set(ids ?? [])].filter(Boolean);
  if (!unique.length) return [];
  const ph = unique.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM users WHERE id IN (${ph})`).all(...unique).map(rowToUser);
}

// Поиск людей и ботов — тоже запросом, а не перебором всех аккаунтов в памяти
// на каждое нажатие клавиши в строке поиска. LIKE по name/username: их длина
// измеряется десятками символов, в отличие от аватара в соседнем поле, поэтому
// полный просмотр здесь стоит дёшево даже без отдельного индекса.
async function searchUsers(query, { limit = 40 } = {}) {
  const q = String(query ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  return db
    .prepare(
      `SELECT * FROM users
        WHERE (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(username) LIKE ? ESCAPE '\\')
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

const PATCHABLE_FIELDS = ["name", "username", "phone", "email", "passwordHash", "passwordSalt", "avatarColor", "avatarImage", "bio", "usernameAuctionId", "online", "lastSeen", "isBot", "premiumUntil", "adsUntil", "adText", "adUrl", "birthday"];

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
  // Changing the handle gives up the collectible mark, unless this very call is
  // the auction awarding one. Otherwise winning @vip once would leave the badge
  // attached to whatever the person renamed themselves to afterwards.
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

// The avatar list and the single `avatarImage` still are written together, in
// one statement: they must never disagree, or the circle in a chat list would
// show a photo the profile no longer has (or the other way round).
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

async function listReferrals(userId) {
  return db.prepare("SELECT * FROM users WHERE referredBy = ?").all(userId).map(rowToUser);
}

// Banning records *why* and *when*, not just that it happened — the reason is
// shown to the banned account on the login screen and to the admin reviewing
// the ban later (server/routes/admin.js's /moderation). Unbanning clears both
// so a lifted ban leaves no stale "reason" hanging around to be shown again
// if the account is ever banned a second time.
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

// Stores a not-yet-confirmed secret (totpEnabledAt stays null until a working
// code proves the authenticator app actually has it).
async function startTotpSetup(userId, secret) {
  db.prepare("UPDATE users SET totpSecret = ?, totpEnabledAt = NULL, totpRecoveryCodes = NULL, twoFactorMethod = 'totp' WHERE id = ?").run(secret, userId);
  return getUser(userId);
}

// The chat method: nothing to store up front but the choice itself. Codes are
// minted per attempt (data/codeLogins.js) and posted to the service chat.
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

// Single-use: a matching hash is removed as it's accepted, so the same recovery
// code can't get someone in twice.
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

// The public safety marker (see server/db.js's safetyLabel comment). A falsy
// label clears it — validating the allowed set is the route's job
// (routes/admin.js's SAFETY_LABELS), not this module's.
async function setVerified(userId, verified) {
  db.prepare("UPDATE users SET isVerified = ? WHERE id = ?").run(verified ? 1 : 0, userId);
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

// Appends to the gift shelf shown on a user's public profile — called once a
// gift actually /deliver's (server/routes/gifts.js), not when it's merely
// requested, so the shelf only ever shows gifts that really landed.
async function addReceivedGift(userId, gift) {
  const row = db.prepare("SELECT giftsReceived FROM users WHERE id = ?").get(userId);
  if (!row) return undefined;
  const current = JSON.parse(row.giftsReceived ?? "[]");
  // Each entry gets its own id so it can be removed later without relying on an
  // array index — an index shifts the moment anything else on the shelf changes,
  // and "delete gift #3" hitting the wrong gift is not an acceptable outcome.
  current.push({ id: `rg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`, ...gift });
  db.prepare("UPDATE users SET giftsReceived = ? WHERE id = ?").run(JSON.stringify(current), userId);
  return getUser(userId);
}

// Takes a gift off someone's shelf. Deliberately does NOT touch gift_issues: a
// limited gift's serial stays claimed forever, because it *was* issued — hiding
// a copy from a profile must not quietly free up a number for someone else and
// let two people end up holding "№7 из 1000".
const removeReceivedGift = db.transaction((userId, giftEntryId) => {
  const row = db.prepare("SELECT giftsReceived FROM users WHERE id = ?").get(userId);
  if (!row) return false;
  const current = JSON.parse(row.giftsReceived ?? "[]");
  // Entries created before ids existed are matched on their contents instead, so
  // an older shelf is still cleanable rather than permanently stuck.
  const idx = current.findIndex((g) => (g.id ? g.id === giftEntryId : `${g.emoji}|${g.at}` === giftEntryId));
  if (idx === -1) return false;
  current.splice(idx, 1);
  db.prepare("UPDATE users SET giftsReceived = ? WHERE id = ?").run(JSON.stringify(current), userId);
  return true;
});

module.exports = {
  setAvatars,
  setVerified,
  listUsers,
  listUsersByIds,
  searchUsers,
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
  deleteUser,
};
