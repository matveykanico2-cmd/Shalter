const db = require("../db");

// The slash-command bot: /start, /help, /ban, /balance, /qr and the rest
// (server/lib/helperBot.js has the full command map). Deliberately distinct
// from the other two built-in accounts:
//   - data/hugoBot.js (Hugo) only answers inside the one-to-one support chat.
//   - data/systemBot.js (Shalter) is strictly one-way — login codes, nothing
//     reads a reply.
// This one works in *any* chat, without needing to be a member of it first —
// it's a utility a chat can reach for, not a participant someone invites.
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

  // A bots row so it gets the bot badge, same as Hugo — no token/code, its
  // replies come from lib/helperBot.js on the server.
  db.prepare(
    `INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')
     ON CONFLICT(id) DO UPDATE SET description = excluded.description`
  ).run(HELPER_BOT_ID, HELPER_BOT_ID, "Слэш-команды: модерация, звёзды, утилиты, развлечения");
}

module.exports = { HELPER_BOT_ID, ensureHelperBotAccount };
