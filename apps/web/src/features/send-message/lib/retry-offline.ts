// Нет сети — запрос повторяем сами (до ~2 минут), как sendRetryingOffline в
// public/js/views/chatView.js: пузырь остаётся «отправляется», а не пропадает с ошибкой.
// Повтор безопасен: clientId тот же, и дошедший запрос сервер второй раз не создаёт.
const GIVE_UP_MS = 120_000;

/** Обрыв сети: fetch не дошёл до сервера (ответ с ошибкой — не обрыв). */
export const isOffline = (err: unknown) => err instanceof TypeError;

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
