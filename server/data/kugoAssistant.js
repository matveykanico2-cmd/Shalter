// "Kugo AI" — a built-in conversational assistant users can message with any
// question, powered by the same Claude integration the bots already use
// (server/lib/ai.js). Seeded once at startup (server/index.js) with a fixed
// well-known id, same pattern as the Shalter service bot (systemBot.js).
//
// It's marked isBot so it shows the bot styling and shares the DM-like chat
// treatment, but it is NOT a programmable Bot API bot — it has no token and no
// user code; replies are generated server-side in routes/messages.js's
// deliverMessage when a message lands in a chat this account is a member of.
const db = require("../db");

const KUGO_AI_ID = "ai_kugo";

// The assistant's persona / system prompt. Kept short and plain — a long
// prompt just spends tokens; the model already knows how to be a helpful
// assistant (see the claude-api skill's guidance on not over-prompting).
const KUGO_SYSTEM_PROMPT =
  "Ты — Kugo AI, встроенный ИИ-ассистент мессенджера Shalter. Отвечай полезно, дружелюбно и по делу на любые вопросы пользователя. " +
  "Отвечай на том языке, на котором пишет пользователь (по умолчанию — русский). Будь кратким, если вопрос простой, и подробным, когда это действительно нужно. " +
  "Ты не имеешь доступа к личным чатам, файлам или данным других пользователей — только к этому разговору.";

function ensureKugoAssistant() {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(KUGO_AI_ID);
  if (existing) return;

  db.prepare(
    `INSERT INTO users (id, name, username, phone, email, avatarColor, bio, online, isBot, blockedUserIds, isPremium)
     VALUES (@id, @name, @username, '', NULL, @avatarColor, @bio, 1, 1, '[]', 0)`
  ).run({
    id: KUGO_AI_ID,
    name: "Kugo AI",
    username: "kugo",
    avatarColor: "#6E56C6",
    bio: "Встроенный ИИ-ассистент. Задайте любой вопрос — отвечу.",
  });
  // A bots row so getBotByUserId() recognizes it as a bot account (for the
  // bot badge / dm-like treatment) — but with NO code, so the normal bot
  // sandbox dispatch in deliverMessage does nothing for it; its replies come
  // from the dedicated Kugo branch instead.
  db.prepare(`INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')`).run(
    KUGO_AI_ID,
    KUGO_AI_ID,
    "Встроенный ИИ-ассистент Shalter"
  );
}

module.exports = { KUGO_AI_ID, KUGO_SYSTEM_PROMPT, ensureKugoAssistant };
