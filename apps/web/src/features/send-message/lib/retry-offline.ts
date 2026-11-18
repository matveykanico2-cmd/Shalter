// Нет сети — запрос повторяем сами (до ~2 минут), как sendRetryingOffline в
// public/js/views/chatView.js: пузырь остаётся «отправляется», а не пропадает с ошибкой.
// Повтор безопасен: clientId тот же, и дошедший запрос сервер второй раз не создаёт.
const GIVE_UP_MS = 120_000;

/**
 * Временная ошибка транспорта. На плохой мобильной сети браузер даёт TypeError,
 * но прокси/шлюз часто успевает вернуть 408, 429 или 5xx. Все эти ответы можно
 * безопасно повторить: сообщение несёт тот же clientId и сервер не создаст дубль.
 */
export const isOffline = (err: unknown) => {
  if (err instanceof TypeError) return true;
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && (status === 408 || status === 425 || status === 429 || status >= 500);
};

/** Ждём delay или появления сети — что раньше. */
function waitForNetwork(delay: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, delay);
    window.addEventListener("online", done);
  });
}

export async function retryOffline<T>(send: () => Promise<T>, now = Date.now) {
  const giveUpAt = now() + GIVE_UP_MS;
  for (let delay = 1500; ; delay = Math.min(delay * 2, 15_000)) {
    try {
      return await send();
    } catch (err) {
      if (!isOffline(err) || now() > giveUpAt) throw err;
      await waitForNetwork(delay);
    }
  }
}
