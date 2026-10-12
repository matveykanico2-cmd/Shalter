const db = require("../db");

const SHALTER_AI_ID = "bot_shalter_ai";

const PROFILE = {
  name: "Shalter AI",
  username: "shalter_ai",
  avatarColor: "#7b5cff",
  bio: "ИИ-ассистент Shalter: отвечает на вопросы, разбирает фото и документы, пишет тексты и рисует картинки. /image — нарисовать, /new — начать заново.",
};

const COMMANDS = [
  { command: "new", description: "Начать разговор заново" },
  { command: "image", description: "Нарисовать картинку по описанию" },
];

function ensureShalterAiAccount() {
  const existing = db.prepare("SELECT id, name FROM users WHERE id = ?").get(SHALTER_AI_ID);
  if (!existing) {
    // Ник мог занять живой человек — тогда бот живёт без ника, его находят через меню.
    const taken = db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(PROFILE.username);
    db.prepare(
      `INSERT INTO users (id, name, username, phone, email, avatarColor, bio, online, isBot, blockedUserIds, isPremium)
       VALUES (@id, @name, @username, '', NULL, @avatarColor, @bio, 1, 1, '[]', 0)`
    ).run({ id: SHALTER_AI_ID, ...PROFILE, username: taken ? "" : PROFILE.username });
  } else if (existing.name !== PROFILE.name) {
    db.prepare("UPDATE users SET name = @name, bio = @bio WHERE id = @id").run({ id: SHALTER_AI_ID, ...PROFILE });
  }
  db.prepare(
    `INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET description = excluded.description, commands = excluded.commands`
  ).run(SHALTER_AI_ID, SHALTER_AI_ID, "ИИ-ассистент: вопросы, фото, документы, картинки", JSON.stringify(COMMANDS));
}

module.exports = { SHALTER_AI_ID, ensureShalterAiAccount };
