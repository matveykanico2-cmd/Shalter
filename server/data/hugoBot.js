const db = require("../db");

const HUGO_ID = "bot_support";

const PROFILE = {
  name: "Hugo",
  username: "hugo",
  avatarColor: "#1f9d63",
  bio: "Поддержка Shalter. Спросите про аккаунт, звёзды, Premium или приложение — отвечу сразу. Пришлите текст — проверю орфографию и пунктуацию.",
};

function ensureHugoAccount() {
  const existing = db.prepare("SELECT id, name, username FROM users WHERE id = ?").get(HUGO_ID);

  if (!existing) {
    db.prepare(
      `INSERT INTO users (id, name, username, phone, email, avatarColor, bio, online, isBot, blockedUserIds, isPremium)
       VALUES (@id, @name, @username, '', NULL, @avatarColor, @bio, 1, 1, '[]', 0)`
    ).run({ id: HUGO_ID, ...PROFILE });
  } else if (existing.username !== PROFILE.username) {
    db.prepare("UPDATE users SET name = @name, username = @username, bio = @bio WHERE id = @id").run({
      id: HUGO_ID,
      ...PROFILE,
    });
    console.log("support account is now the Hugo bot");
  }

  db.prepare(
    `INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')
     ON CONFLICT(id) DO UPDATE SET description = excluded.description`
  ).run(HUGO_ID, HUGO_ID, "Поддержка Shalter и проверка текста");
}

module.exports = { HUGO_ID, ensureHugoAccount };
