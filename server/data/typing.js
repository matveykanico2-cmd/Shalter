// Ephemeral typing presence — no persistence needed, entries self-expire.
const TTL_MS = 4000;

const typingByChatId = new Map();

function markTyping(chatId, userId) {
  typingByChatId.set(chatId, { userId, expiresAt: Date.now() + TTL_MS });
}

function getTypingUserId(chatId, viewerId) {
  const entry = typingByChatId.get(chatId);
  if (!entry || entry.expiresAt < Date.now() || entry.userId === viewerId) return null;
  return entry.userId;
}

module.exports = { markTyping, getTypingUserId };
