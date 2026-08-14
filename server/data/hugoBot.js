const db = require("../db");

// Hugo — the account you write to when something isn't working.
//
// This slot used to hold a passive "Поддержка Shalter" account: you could write
// to it, but nothing was at the other end until a human opened it, so the common
// questions ("как купить звёзды", "где скачать") sat unanswered for as long as
// nobody was staffing it. Hugo answers those itself, immediately, and says
// plainly when it can't help so a person picks the thread up. It's the same Hugo
// as the composer's writing checker (routes/hugo.js) — send it a sentence and it
// proofreads it.
//
// Distinct from the Shalter service bot (data/systemBot.js) on purpose: that one
// is strictly one-way — login codes and security alerts, with nothing at the
// other end to read a reply. It's also distinct from the administration's own
// DM, which is closed to direct messages (routes/messages.js) so purchase
// requests aren't buried under support traffic.
//
// The row id stays "bot_support": every existing support chat, and every message
// already in one, points at it. Renaming the account in place keeps those
// conversations intact — a new id would have orphaned them and left people with
// a dead chat next to a new one.
const HUGO_ID = "bot_support";

const PROFILE = {
  name: "Hugo",
  // @hugo is in lib/username.js's reserved list, so no real account can take
  // this handle out from under it. @support stays reserved too, so nobody can
  // claim the handle this account used to hold and impersonate support.
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
    // Upgrade path for a deployment that already seeded the old passive
    // "Поддержка Shalter" account.
    db.prepare("UPDATE users SET name = @name, username = @username, bio = @bio WHERE id = @id").run({
      id: HUGO_ID,
      ...PROFILE,
    });
    console.log("support account is now the Hugo bot");
  }

  // A bots row so it gets the bot badge and bot-like chat treatment. No token
  // and no code: its replies come from lib/hugoBot.js on the server, not from
  // the sandbox that runs user-programmed bots.
  db.prepare(
    `INSERT INTO bots (id, userId, description, commands) VALUES (?, ?, ?, '[]')
     ON CONFLICT(id) DO UPDATE SET description = excluded.description`
  ).run(HUGO_ID, HUGO_ID, "Поддержка Shalter и проверка текста");
}

module.exports = { HUGO_ID, ensureHugoAccount };
