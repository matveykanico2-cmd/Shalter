// Ephemeral typing presence — no persistence needed, entries self-expire.
const TTL_MS = 4000;

interface TypingEntry {
  userId: string;
  expiresAt: number;
}

const typingByChatId = new Map<string, TypingEntry>();

export function markTyping(chatId: string, userId: string): void {
  typingByChatId.set(chatId, { userId, expiresAt: Date.now() + TTL_MS });
}

export function getTypingUserId(chatId: string, viewerId: string): string | null {
  const entry = typingByChatId.get(chatId);
  if (!entry || entry.expiresAt < Date.now() || entry.userId === viewerId) return null;
  return entry.userId;
}
