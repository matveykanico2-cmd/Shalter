// Tiny in-memory state for multi-step commands (currently just /game's
// number-guess) — per (chat, user), cleared by /cancel or once resolved.
// In-memory only: fine for a single-process deployment, same constraint the
// rest of the app already lives under (see AGENTS.md on WS/typing state).
const pending = new Map();

function key(chatId, userId) {
  return `${chatId}:${userId}`;
}

function setPending(chatId, userId, state) {
  pending.set(key(chatId, userId), state);
}

function getPending(chatId, userId) {
  return pending.get(key(chatId, userId)) ?? null;
}

function clearPending(chatId, userId) {
  pending.delete(key(chatId, userId));
}

module.exports = { setPending, getPending, clearPending };
