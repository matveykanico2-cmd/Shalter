const fs = require("fs");
const path = require("path");
const db = require("../db");

// Заставка-крабик с табличкой «Shalter.ru» — общий аватар Shalter AI и Hugo.
// Файл лежит в public/img/bots; если его ещё не положили — бот остаётся с
// цветным кружком, а как только файл появится, аватар подхватится при старте.
const MASCOT_DIR = path.join(__dirname, "..", "..", "public", "img", "bots");
const MASCOT_NAMES = ["shalter-crab.webp", "shalter-crab.jpg", "shalter-crab.jpeg", "shalter-crab.png"];

function mascotUrl() {
  const name = MASCOT_NAMES.find((n) => fs.existsSync(path.join(MASCOT_DIR, n)));
  return name ? `/img/bots/${name}` : null;
}

function applyBotMascot(botId) {
  const url = mascotUrl();
  if (!url) return;
  db.prepare("UPDATE users SET avatarImage = ?, avatarImages = ? WHERE id = ? AND (avatarImage IS NULL OR avatarImage != ?)").run(
    url,
    JSON.stringify([{ url, kind: "image", poster: url }]),
    botId,
    url
  );
}

module.exports = { mascotUrl, applyBotMascot };
