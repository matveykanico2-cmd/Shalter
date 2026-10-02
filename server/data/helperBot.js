const db = require("../db");

const HELPER_BOT_ID = "bot_helper";

const PROFILE = {
  name: "Помощник",
  username: "helper",
  avatarColor: "#7C5CFC",
  bio: "Слэш-команды прямо в чате. Напишите /help — покажу список.",
};

function ensureHelperBotAccount() {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(HELPER_BOT_ID);
  if (!existing) {
    db.prepare(
      `INSERT INTO users (id, name, username, phone, email, avatarColor, bio, online, isBot, blockedUserIds, isPremium)
       VALUES (@id, @name, @username, '', NULL, @avatarColor, @bio, 1, 1, '[]', 0)`
    ).run({ id: HELPER_BOT_ID, ...PROFILE });
  }

  db.prepare(
    `INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')
     ON CONFLICT(id) DO UPDATE SET description = excluded.description`
  ).run(HELPER_BOT_ID, HELPER_BOT_ID, "Слэш-команды: модерация, звёзды, утилиты, развлечения");
}

module.exports = { HELPER_BOT_ID, ensureHelperBotAccount };
