// Повтор одной и той же отправки не создаёт второе сообщение. На плохой мобильной сети
// запрос доходит до сервера, а ответ теряется — клиент отправляет снова, и в чате
// появлялись дубли. Клиент помечает каждую отправку своим clientId; повтор с тем же
// clientId (в том числе одновременный) получает тот же ответ, что и первый запрос.
// Хранится в памяти процесса — сервер и так работает одним процессом (DEPLOY.md).
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 20000;
const recent = new Map();

function sweep(now) {
  for (const [key, entry] of recent) {
    if (entry.expires > now && recent.size <= MAX_ENTRIES) break;
    recent.delete(key);
  }
}

// run() вызывается только при первой отправке; её ошибку не запоминаем — повтор пройдёт заново.
function sendOnce(userId, chatId, clientId, run) {
  if (typeof clientId !== "string" || !clientId || clientId.length > 100) return run();
  const now = Date.now();
  sweep(now);
  const key = `${userId}:${chatId}:${clientId}`;
  const hit = recent.get(key);
  if (hit && hit.expires > now) return hit.result;
  const result = Promise.resolve().then(run);
  recent.set(key, { result, expires: now + TTL_MS });
  result.catch(() => recent.delete(key));
  return result;
}

module.exports = { sendOnce };
