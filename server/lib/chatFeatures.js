const { levelForPoints } = require("./groupLevels");

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
  { hex: "linear-gradient(135deg, #6e56c6, #c94f8e)", name: "Закат", level: 6 },
  { hex: "linear-gradient(135deg, #1c9bd9, #1f9d63)", name: "Лагуна", level: 6 },
];

function isGated(chat) {
  return chat?.type === "group" || chat?.type === "channel";
}

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

function colorState(chat) {
  const level = isGated(chat) ? levelForPoints(chat.points ?? 0) : Infinity;
  return CHAT_COLORS.map((c) => ({ ...c, unlocked: level >= c.level }));
}

module.exports = { CHAT_COLORS, colorUnlocked, lockedColorError, colorState, isGated };
