const db = require("../db");

const SYSTEM_BOT_ID = "bot_shalter";

const SYSTEM_BOT_AVATAR = "/icons/icon.svg";

function ensureSystemBot() {
  const existing = db.prepare("SELECT id, avatarImage FROM users WHERE id = ?").get(SYSTEM_BOT_ID);
  if (existing) {
    if (existing.avatarImage !== SYSTEM_BOT_AVATAR) {
      db.prepare("UPDATE users SET avatarImage = ?, avatarImages = ? WHERE id = ?").run(
        SYSTEM_BOT_AVATAR,
        JSON.stringify([SYSTEM_BOT_AVATAR]),
        SYSTEM_BOT_ID
      );
    }
    return;
  }

  db.prepare(
    `INSERT INTO users (id, name, username, phone, email, avatarColor, avatarImage, avatarImages, bio, online, isBot, blockedUserIds, isPremium)
     VALUES (@id, @name, @username, '', NULL, @avatarColor, @avatarImage, @avatarImages, @bio, 1, 1, '[]', 0)`
  ).run({
    id: SYSTEM_BOT_ID,
    name: "Shalter",
    username: "shalter",
    avatarColor: "#2E56D9",
    avatarImage: SYSTEM_BOT_AVATAR,
    avatarImages: JSON.stringify([SYSTEM_BOT_AVATAR]),
    bio: "Официальные уведомления: коды входа и оповещения о безопасности аккаунта.",
  });
  db.prepare(`INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')`).run(
    SYSTEM_BOT_ID,
    SYSTEM_BOT_ID,
    "Служебные уведомления Shalter"
  );
}

module.exports = { SYSTEM_BOT_ID, SYSTEM_BOT_AVATAR, ensureSystemBot };
