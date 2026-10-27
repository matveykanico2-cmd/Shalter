// Данные прошлого запуска в localStorage (public/js/lib/localCache.js): список чатов
// рисуется сразу, не дожидаясь ответа сервера. Ключи — по id пользователя, сутки жизни;
// формат ключей тот же, что у старого клиента.
const PREFIX = "shalter.cache.";
const VERSION = "1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const keyFor = (name: string, userId: string | null | undefined) => `${PREFIX}${VERSION}.${userId || "anon"}.${name}`;

export function readCache<T>(name: string, userId: string | null | undefined): T | null {
  try {
    const raw = localStorage.getItem(keyFor(name, userId));
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at?: number; data: T };
    if (!at || Date.now() - at > MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeCache(name: string, userId: string | null | undefined, data: unknown) {
  const value = JSON.stringify({ at: Date.now(), data });
  try {
    localStorage.setItem(keyFor(name, userId), value);
  } catch {
    // Место кончилось — выбрасываем весь свой кэш и пробуем ещё раз.
    try {
      clearCache();
      localStorage.setItem(keyFor(name, userId), value);
    } catch {
      // без кэша — просто медленнее старт
    }
  }
}

/** Выход и удаление аккаунта: чужие чаты не должны остаться на устройстве. */
export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // хранилище недоступно — и кэша нет
  }
}
