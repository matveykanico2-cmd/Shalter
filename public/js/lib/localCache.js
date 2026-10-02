const PREFIX = "shalter.cache.";
const VERSION = "1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function keyFor(name, userId) {
  return `${PREFIX}${VERSION}.${userId || "anon"}.${name}`;
}

export function readCache(name, userId) {
  try {
    const raw = localStorage.getItem(keyFor(name, userId));
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (!at || Date.now() - at > MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeCache(name, userId, data) {
  try {
    localStorage.setItem(keyFor(name, userId), JSON.stringify({ at: Date.now(), data }));
  } catch {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
      localStorage.setItem(keyFor(name, userId), JSON.stringify({ at: Date.now(), data }));
    } catch {
    }
  }
}

export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
  }
}

export function dropCachedMessage(chatId, messageId, userId) {
  const cached = readCache(`chat.${chatId}`, userId);
  if (!cached?.messages?.some((m) => m.id === messageId)) return;
  writeCache(`chat.${chatId}`, userId, { ...cached, messages: cached.messages.filter((m) => m.id !== messageId) });
}
