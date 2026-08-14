const { USERNAME_RE } = require("./validators");
const { findUserByUsername } = require("../data/users");
const { findChatByUsername } = require("../data/chats");

// One shared @handle namespace, checked in one place.
//
// Accounts and public channels draw from the same pool of handles — a link is
// just /u/:username (public/js/app.js), so if a person and a channel could both
// hold "@news" that URL would be ambiguous. routes/chats.js's /:id/public knew
// that and checked both tables; routes/users.js's PATCH checked only users, even
// though its own comment claimed parity. So a person could quietly take a handle
// a public channel was already using. Registration would have been a third copy
// of the same check to get subtly wrong, hence this module: every path that
// claims a handle goes through checkUsername().
//
// Names the client-side router owns. Someone holding "@settings" makes
// /u/settings unreachable, and "@chat" reads as an official Shalter handle
// besides. Also blocks the obvious impersonation handles for the app itself.
const RESERVED = new Set([
  "chat",
  "call",
  "calls",
  "call_join",
  "contacts",
  "discover",
  "discover_channels",
  "archive",
  "settings",
  "login",
  "logout",
  "register",
  "admin",
  // @support stays reserved even though the account now answers as @hugo:
  // nobody may claim the handle support used to hold and impersonate it.
  "support",
  "hugo",
  "shalter",
  "shalter_bot",
  "shalter_support",
  "official",
  "system",
]);

// Returns null when the handle is free to claim, or { status, error } ready to
// hand straight to res.status(...).json(...).
//
// `forUserId` / `forChatId` exempt the current holder, so re-saving a profile
// or a channel's settings without changing the handle isn't a conflict with
// itself.
async function checkUsername(raw, { forUserId, forChatId } = {}) {
  const username = String(raw ?? "").trim().replace(/^@/, "");

  if (!USERNAME_RE.test(username)) {
    return { status: 400, error: "Юзернейм: 5–32 символа, латинские буквы, цифры и _" };
  }
  if (RESERVED.has(username.toLowerCase())) {
    return { status: 409, error: "Этот юзернейм зарезервирован — выберите другой" };
  }

  const [existingUser, existingChat] = await Promise.all([findUserByUsername(username), findChatByUsername(username)]);
  if (existingUser && existingUser.id !== forUserId) {
    return { status: 409, error: "Этот юзернейм уже занят" };
  }
  if (existingChat && existingChat.id !== forChatId) {
    return { status: 409, error: "Этот юзернейм уже занят каналом" };
  }
  return null;
}

// The normalized form to actually store — what the client typed minus a leading
// @ and surrounding whitespace. Case is preserved as typed (lookups are
// case-insensitive; see data/users.js's findUserByUsername), same as Telegram
// showing "@IvanPetrov" while matching "@ivanpetrov".
function normalizeUsername(raw) {
  return String(raw ?? "").trim().replace(/^@/, "");
}

// better-sqlite3 throws this when the unique index on lower(username) rejects an
// insert/update. checkUsername() above is a read-then-write, so two
// registrations racing on the same handle can both pass it and one will land
// here — that's a 409 for the loser, not a 500.
function isUsernameConflict(err) {
  return /UNIQUE constraint failed/i.test(err?.message ?? "") && /username/i.test(err?.message ?? "");
}

// Cyrillic → Latin, so a bot called "Мой помощник" gets "moy_pomoshchnik_bot"
// rather than a handle made of characters USERNAME_RE rejects outright.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y",
  ь: "", э: "e", ю: "yu", я: "ya",
};

function translit(text) {
  return String(text ?? "")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("");
}

// A free, valid "@..._bot" handle derived from a bot's display name
// (routes/bots.js). That route used to build one inline as
// `${name.toLowerCase().replace(/\s+/g, "_")}_bot` with no validation and no
// uniqueness check at all, which meant: a Cyrillic name produced a handle no
// USERNAME_RE-checked path could ever match, and a second bot with the same
// name — or a bot whose derived handle a real account already held — hit the
// unique index on lower(username) and came back as a 500.
async function generateBotUsername(name) {
  let base = translit(name)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!base) base = "bot"; // a name with nothing transliterable left in it
  base = base.slice(0, 24);

  // USERNAME_RE's 5-char minimum, counting the suffix.
  let candidate = base.endsWith("_bot") ? base : `${base}_bot`;
  if (candidate.length < 5) candidate = `${candidate}_bot`;

  if (!(await checkUsername(candidate))) return candidate;
  // Taken (or reserved): walk suffixes rather than failing the bot creation.
  for (let i = 2; i < 1000; i++) {
    const next = `${candidate}${i}`.slice(0, 32);
    if (!(await checkUsername(next))) return next;
  }
  return null;
}

module.exports = { checkUsername, normalizeUsername, isUsernameConflict, generateBotUsername, RESERVED };
