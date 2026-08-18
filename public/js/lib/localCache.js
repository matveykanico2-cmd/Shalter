// Небольшой склад последнего показанного — чтобы на плохой связи приложение
// открывалось сразу, а не белым экраном.
//
// Смысл простой: то, что человек уже видел в прошлый раз, можно нарисовать
// мгновенно, пока сеть только собирается ответить. Через мгновение придёт
// свежее и заменит показанное. Пустой экран на пять секунд читается как
// «сломалось», а слегка несвежий список — как обычная работа.
//
// Держим в localStorage, а не в IndexedDB: объёмы крошечные (список чатов и
// последняя страница переписки), а localStorage читается синхронно — то есть
// доступен в тот же миг, когда приложение начинает рисовать, без ожидания
// ответа хранилища.

const PREFIX = "shalter.cache.";
// Версия ключа: если форма данных изменится, старое просто перестанет
// подходить, а не будет тихо ломать отрисовку.
const VERSION = "1";
// Дольше суток показывать прошлое незачем: это уже не «пока грузится», а
// «показываем позавчерашнее».
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
    // Испорченная или переполненная запись — не повод падать при запуске.
    return null;
  }
}

export function writeCache(name, userId, data) {
  try {
    localStorage.setItem(keyFor(name, userId), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Переполнено (браузер даёт около пяти мегабайт) — сбрасываем свои записи
    // и пробуем ещё раз, но уже без настойчивости: кэш необязателен.
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
      localStorage.setItem(keyFor(name, userId), JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* и ладно */
    }
  }
}

// Выход из аккаунта: чужую переписку на общем устройстве оставлять нельзя.
export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* нечего чистить */
  }
}
