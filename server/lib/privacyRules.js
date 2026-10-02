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

module.exports = { PRIVACY_KEYS, privacyAllows, allowsUser, normalizePrivacy, exceptionsFor };
