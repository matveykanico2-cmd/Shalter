// Данные прошлого запуска в localStorage (public/js/lib/localCache.js): список чатов
// рисуется сразу, не дожидаясь ответа сервера. Ключи — по id пользователя, сутки жизни;
// формат ключей тот же, что у старого клиента.
import { idbClear } from "./idb-store";

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
      clearLocal();
      localStorage.setItem(keyFor(name, userId), value);
    } catch {
      // без кэша — просто медленнее старт
    }
  }
}

let generation = 0;
const clearListeners = new Set<() => void>();

/** Сколько раз кэш стирали: отложенная запись, начатая до стирания, уже не нужна. */
export const cacheGeneration = () => generation;

/** Подписка на стирание кэша (данные в памяти модулей тоже должны уйти). Возвращает отписку. */
export function onCacheCleared(listener: () => void) {
  clearListeners.add(listener);
  return () => void clearListeners.delete(listener);
}

// Ответы, с которыми приложение открывается без сети: их хранит Service Worker (public/sw.js, OFFLINE_API).
const OFFLINE_API = ["/api/auth/session", "/api/bootstrap"];

/** Выход и смена аккаунта: без сети приложение не должно открыться под прежним аккаунтом. */
export function clearOfflineApi() {
  try {
    if (typeof caches === "undefined") return;
    void caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("shalter-"))
            .map((name) => caches.open(name).then((cache) => Promise.all(OFFLINE_API.map((path) => cache.delete(path, { ignoreSearch: true })))))
        )
      )
      .catch(() => {});
  } catch {
    // Cache Storage недоступен — и хранить там нечего
  }
}

/** Выход и удаление аккаунта: чужие чаты не должны остаться на устройстве. */
export function clearCache() {
  generation++;
  idbClear();
  clearLocal();
  clearOfflineApi();
  for (const listener of clearListeners) listener();
}

function clearLocal() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // хранилище недоступно — и кэша нет
  }
}
