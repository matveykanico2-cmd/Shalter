// The "Shalter" service account — sends login codes and new-device security
// alerts, the same way Telegram's own "Telegram" service chat does. Seeded
// once at server startup (see server/index.js) if it doesn't exist yet; a
// fixed, well-known id rather than a normal signup so there's exactly one
// per deployment.
const db = require("../db");

const SYSTEM_BOT_ID = "bot_shalter";

function ensureSystemBot() {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(SYSTEM_BOT_ID);
  if (existing) return;

  db.prepare(
    `INSERT INTO users (id, name, username, phone, email, avatarColor, bio, online, isBot, blockedUserIds, isPremium)
     VALUES (@id, @name, @username, '', NULL, @avatarColor, @bio, 1, 1, '[]', 0)`
  ).run({
    id: SYSTEM_BOT_ID,
    name: "Shalter",
    username: "shalter",
    avatarColor: "#2E56D9",
    bio: "Официальные уведомления: коды входа и оповещения о безопасности аккаунта.",
  });
  db.prepare(`INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')`).run(
    SYSTEM_BOT_ID,
    SYSTEM_BOT_ID,
    "Служебные уведомления Shalter"
  );
}

module.exports = { SYSTEM_BOT_ID, ensureSystemBot };
