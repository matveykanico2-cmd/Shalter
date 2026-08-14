const db = require("../db");

// The "Поддержка Shalter" account.
//
// Distinct from the Shalter service bot (data/systemBot.js) on purpose: that one
// is strictly one-way — login codes and security alerts, with nothing at the
// other end to read a reply — while this one exists precisely to be written to.
// It's also distinct from the administration's own DM, which is closed to direct
// messages (routes/messages.js) so purchase requests aren't buried under support
// traffic.
//
// Seeded once at startup with a fixed id, same as the service bot: exactly one
// per deployment, not a normal signup someone could impersonate.
const SUPPORT_ID = "bot_support";

function ensureSupportAccount() {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(SUPPORT_ID);
  if (existing) return;

  db.prepare(
    `INSERT INTO users (id, name, username, phone, email, avatarColor, bio, online, isBot, blockedUserIds, isPremium)
     VALUES (@id, @name, @username, '', NULL, @avatarColor, @bio, 1, 1, '[]', 0)`
  ).run({
    id: SUPPORT_ID,
    name: "Поддержка Shalter",
    // @support is in lib/username.js's reserved list, so no real account can
    // take this handle out from under it.
    username: "support",
    avatarColor: "#1f9d63",
    bio: "Напишите нам, если что-то не работает или есть вопрос по аккаунту. Отвечаем в этом чате.",
  });
  // A bots row so it gets the bot badge and bot-like chat treatment — but with
  // no token and no code, so nothing dispatches automatically. Replies here are
  // written by whoever staffs support, from their own admin account.
  db.prepare(`INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')`).run(
    SUPPORT_ID,
    SUPPORT_ID,
    "Поддержка Shalter"
  );
}

module.exports = { SUPPORT_ID, ensureSupportAccount };
