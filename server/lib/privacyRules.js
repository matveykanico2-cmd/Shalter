const { getSettings } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");

const LEVELS = new Set(["everyone", "contacts", "nobody"]);

const DEFAULT_LEVELS = { storiesArchive: "nobody" };
const defaultLevelFor = (key) => DEFAULT_LEVELS[key] ?? "everyone";

const PRIVACY_KEYS = [
  "lastSeen",
  "phone",
  "discoverByPhone",
  "photo",
  "bio",
  "birthday",
  "forwards",
  "invites",
  "calls",
  "messages",
  "botMessages",
  "storiesArchive",
];

const MAX_PER_LIST = 200;

function idsOf(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const id of value) {
    if (typeof id !== "string" || !id) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= MAX_PER_LIST) break;
  }
  return out;
}

function exceptionsFor(privacy, key) {
  const raw = privacy?.exceptions?.[key];
  return { allow: idsOf(raw?.allow), deny: idsOf(raw?.deny) };
}

function normalizePrivacy(privacy) {
  if (!privacy || typeof privacy !== "object") return privacy;
  const next = { ...privacy };
  delete next.exceptions;
  const raw = privacy.exceptions;
  if (!raw || typeof raw !== "object") return next;
  const exceptions = {};
  for (const key of PRIVACY_KEYS) {
    const { allow, deny } = exceptionsFor({ exceptions: raw }, key);
    const cleanAllow = allow.filter((id) => !deny.includes(id));
    if (cleanAllow.length || deny.length) exceptions[key] = { allow: cleanAllow, deny };
  }
  if (Object.keys(exceptions).length) next.exceptions = exceptions;
  return next;
}

function privacyAllows(privacy, key, viewerId, isContact) {
  const { allow, deny } = exceptionsFor(privacy, key);
  if (viewerId && deny.includes(viewerId)) return false;
  if (viewerId && allow.includes(viewerId)) return true;
  const level = LEVELS.has(privacy?.[key]) ? privacy[key] : defaultLevelFor(key);
  if (level === "everyone") return true;
  if (level === "nobody") return false;
  return !!isContact;
}

async function allowsUser(ownerId, key, viewerId) {
  if (ownerId === viewerId) return true;
  const { privacy } = await getSettings(ownerId);
  const { allow, deny } = exceptionsFor(privacy, key);
  if (deny.includes(viewerId)) return false;
  if (allow.includes(viewerId)) return true;
  const level = LEVELS.has(privacy?.[key]) ? privacy[key] : defaultLevelFor(key);
  if (level === "everyone") return true;
  if (level === "nobody") return false;
  const contacts = await listContactsFor(ownerId);
  return contacts.some((c) => c.userId === viewerId);
}

// Время прочтения пишем только в личке и только если читатель показывает
// собеседнику, когда был в сети, — как в Telegram.
async function recordsReadTime(chat, readerId) {
  if (chat?.type !== "dm") return false;
  const other = chat.memberIds.find((id) => id !== readerId);
  return !!other && (await allowsUser(readerId, "lastSeen", other));
}

// publicUser(), но с учётом приватности того, чей профиль смотрят: время
// визита, фото, «о себе» и день рождения — как в GET /users/:id.
async function publicUserFor(user, viewerId) {
  const { publicUser } = require("../data/sanitize");
  const visible = publicUser(user);
  if (!user || user.id === viewerId) return visible;
  const { privacy } = await getSettings(user.id);
  const isContact = (await listContactsFor(user.id)).some((c) => c.userId === viewerId);
  const canSee = (key) => privacyAllows(privacy, key, viewerId, isContact);
  const blocked = (user.blockedUserIds ?? []).includes(viewerId);
  if (blocked || !canSee("lastSeen")) {
    delete visible.lastSeen;
    visible.online = false;
  }
  if (blocked || !canSee("photo")) {
    delete visible.avatarImage;
    delete visible.avatarImages;
  }
  if (!canSee("bio")) delete visible.bio;
  if (!canSee("birthday")) delete visible.birthday;
  return visible;
}

function publicUsersFor(users, viewerId) {
  return Promise.all(users.map((u) => publicUserFor(u, viewerId)));
}

module.exports = { PRIVACY_KEYS, privacyAllows, allowsUser, normalizePrivacy, exceptionsFor, recordsReadTime, publicUserFor, publicUsersFor };
