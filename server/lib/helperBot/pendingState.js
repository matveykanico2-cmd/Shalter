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
