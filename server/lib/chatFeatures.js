const { levelForPoints } = require("./groupLevels");

// What a group's level unlocks.
//
// Levels used to be purely cosmetic — a badge and nothing else. They now gate
// how much a group or channel can be customised, so the score people vote up
// actually buys something (server/routes/chats.js's /vote is where points come
// from). Ordered cheapest-first: each level adds one thing and keeps everything
// below it.
//
// Deliberately only features that already exist in the app, rather than
// inventing new ones to have something to lock: an unlock that reveals a real
// button beats an unlock that reveals a placeholder.
// Only chat-wide settings belong here. A chat's *wallpaper*, for instance, is
// deliberately absent: routes/chats.js's /wallpaper stores it per viewer, so
// locking it behind the group's level would ration a personal preference on
// other people's votes.
const FEATURES = [
  { id: "avatar", level: 1, label: "Аватар чата" },
  { id: "description", level: 2, label: "Описание чата" },
  { id: "autoDelete", level: 3, label: "Автоудаление сообщений" },
  { id: "publicLink", level: 4, label: "Публичная ссылка @юзернейм" },
  { id: "moderators", level: 5, label: "Роль модератора" },
];

// A DM has no level and no points — nothing here applies to it, and everything
// stays available. Gating a private conversation on a score nobody can vote for
// would just break it.
function isGated(chat) {
  return chat?.type === "group" || chat?.type === "channel";
}

function featureFor(id) {
  return FEATURES.find((f) => f.id === id);
}

function unlocked(chat, featureId) {
  if (!isGated(chat)) return true;
  const feature = featureFor(featureId);
  if (!feature) return true;
  return levelForPoints(chat.points ?? 0) >= feature.level;
}

// The message a route returns when something is still locked — names the level
// needed, because "недостаточно прав" would be actively misleading here: it's not
// about permissions, it's about the group's own progress.
function lockedError(featureId) {
  const feature = featureFor(featureId);
  return `«${feature?.label ?? featureId}» открывается на ${feature?.level ?? "?"}-м уровне группы — набирайте баллы голосами участников`;
}

// The whole table with each entry's state, for the info panel to show what's
// unlocked and what's next.
function featureState(chat) {
  const level = isGated(chat) ? levelForPoints(chat.points ?? 0) : Infinity;
  return FEATURES.map((f) => ({ ...f, unlocked: level >= f.level }));
}

module.exports = { FEATURES, unlocked, lockedError, featureState, isGated };
