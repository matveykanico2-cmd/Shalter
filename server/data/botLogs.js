// Ephemeral per-bot execution log — same "in-memory, no persistence" pattern
// as typing.js/qrLogins.js: this is debug output for the bot's owner, not
// data anyone needs surviving a server restart. Ring buffer capped per bot
// so a bot stuck logging in a loop can't grow this unboundedly.
const MAX_ENTRIES_PER_BOT = 100;

const logsByBotId = new Map();

function append(botId, level, text) {
  const entries = logsByBotId.get(botId) ?? [];
  entries.push({ level, text: String(text).slice(0, 2000), at: new Date().toISOString() });
  while (entries.length > MAX_ENTRIES_PER_BOT) entries.shift();
  logsByBotId.set(botId, entries);
}

function getLogs(botId) {
  return logsByBotId.get(botId) ?? [];
}

module.exports = { append, getLogs };
