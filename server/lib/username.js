const { USERNAME_RE } = require("./validators");
const { findUserByUsername } = require("../data/users");
const { findChatByUsername } = require("../data/chats");
const auctions = require("../data/usernameAuctions");

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
  "support",
  "hugo",
  "helper",
  "shalter",
  "shalter_bot",
  "shalter_support",
  "official",
  "system",
]);

// Юзернейм с открытого аукциона занять нельзя (иначе его брали бы бесплатно через профиль,
// а аукцион срывался). Истёкший аукцион без ставок не держит имя — он закроется как unsold.
// ignoreAuctions — для самого аукциона (выдача победителю, выставление) и выдачи администрацией.
function isOnAuction(username) {
  const auction = auctions.findOpenByUsername(username);
  return !!auction && (!auction.expired || auction.bids.length > 0);
}

async function checkUsername(raw, { forUserId, forChatId, ignoreAuctions = false } = {}) {
  const username = String(raw ?? "").trim().replace(/^@/, "");

  if (!USERNAME_RE.test(username)) {
    return { status: 400, error: "Юзернейм: 3–32 символа, латинские буквы, цифры и _" };
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
  // Свой текущий юзернейм (или юзернейм своего канала) оставить можно.
  const ownsIt = (existingUser && existingUser.id === forUserId) || (existingChat && existingChat.id === forChatId);
  if (!ignoreAuctions && !ownsIt && isOnAuction(username)) {
    return { status: 409, error: "Этот юзернейм сейчас на аукционе" };
  }
  return null;
}

function normalizeUsername(raw) {
  return String(raw ?? "").trim().replace(/^@/, "");
}

function isUsernameConflict(err) {
  return /UNIQUE constraint failed/i.test(err?.message ?? "") && /username/i.test(err?.message ?? "");
}

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

async function generateBotUsername(name) {
  let base = translit(name)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!base) base = "bot";
  base = base.slice(0, 24);

  let candidate = base.endsWith("_bot") ? base : `${base}_bot`;
  if (candidate.length < 3) candidate = `${candidate}_bot`;

  if (!(await checkUsername(candidate))) return candidate;
  for (let i = 2; i < 1000; i++) {
    const next = `${candidate}${i}`.slice(0, 32);
    if (!(await checkUsername(next))) return next;
  }
  return null;
}

module.exports = { checkUsername, normalizeUsername, isUsernameConflict, generateBotUsername, RESERVED };
