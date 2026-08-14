const { levelForPoints } = require("./groupLevels");

// What a group's level unlocks: colours, and nothing else.
//
// It used to gate the useful things — avatar, description, auto-delete, the
// public @link, the moderator role — behind levels 1 to 5. That meant a brand
// new group couldn't be given a picture or a description, and a channel couldn't
// be made public until its members had voted it to level 4, which is backwards:
// those are the things you do *when you create it*, and the only way to get
// points is to already have members. Running a chat is now free; levels buy
// decoration.
//
// Colours are a real reward and cost nothing to withhold: the chat works
// identically in grey, so an unearned palette entry is a missing flourish rather
// than a missing feature.
const CHAT_COLORS = [
  { hex: "#2E56D9", name: "Синий", level: 0 },
  { hex: "#1f9d63", name: "Зелёный", level: 0 },
  { hex: "#8a8f98", name: "Серый", level: 0 },
  { hex: "#c6403b", name: "Красный", level: 1 },
  { hex: "#d9822e", name: "Оранжевый", level: 1 },
  { hex: "#6e56c6", name: "Фиолетовый", level: 2 },
  { hex: "#1c9bd9", name: "Голубой", level: 2 },
  { hex: "#c94f8e", name: "Розовый", level: 3 },
  { hex: "#0f8a8a", name: "Бирюзовый", level: 3 },
  { hex: "#e0a84a", name: "Золотой", level: 4 },
  { hex: "#7a5c3a", name: "Кофейный", level: 4 },
  { hex: "#1b2130", name: "Графитовый", level: 5 },
  // Avatar's fallback sets `background`, which takes a gradient as happily as a
  // colour — so the top of the ladder is something a solid colour can't be.
  { hex: "linear-gradient(135deg, #6e56c6, #c94f8e)", name: "Закат", level: 6 },
  { hex: "linear-gradient(135deg, #1c9bd9, #1f9d63)", name: "Лагуна", level: 6 },
];

// A DM has no level and no points — nothing here applies to it, and everything
// stays available. Gating a private conversation on a score nobody can vote for
// would just break it.
function isGated(chat) {
  return chat?.type === "group" || chat?.type === "channel";
}

// An unknown colour is allowed: `avatarColor` is also set by the client's own
// random palette when a chat is created, and rejecting anything not on this list
// would make the list the only source of colours in the app.
function colorUnlocked(chat, hex) {
  if (!isGated(chat) || !hex) return true;
  const entry = CHAT_COLORS.find((c) => c.hex === hex);
  if (!entry) return true;
  return levelForPoints(chat.points ?? 0) >= entry.level;
}

function lockedColorError(hex) {
  const entry = CHAT_COLORS.find((c) => c.hex === hex);
  return `Цвет «${entry?.name ?? hex}» открывается на ${entry?.level ?? "?"}-м уровне — набирайте баллы голосами участников`;
}

// The whole palette with each entry's state, for the info panel to show what's
// unlocked and what the next level adds.
function colorState(chat) {
  const level = isGated(chat) ? levelForPoints(chat.points ?? 0) : Infinity;
  return CHAT_COLORS.map((c) => ({ ...c, unlocked: level >= c.level }));
}

module.exports = { CHAT_COLORS, colorUnlocked, lockedColorError, colorState, isGated };
