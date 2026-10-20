// Уже принятые шаги TOTP по пользователям: один и тот же код из приложения
// нельзя использовать второй раз (RFC 6238 §5.2), даже с новым билетом входа.
// Хранится в памяти процесса: код живёт не дольше окна ±1 шаг (~1,5 мин), а
// сервер работает одним процессом (см. DEPLOY.md) — после перезапуска окно уже прошло.
const { STEP_SECONDS, WINDOW_STEPS } = require("../lib/totp");

const used = new Map();

function currentStep() {
  return Math.floor(Date.now() / 1000 / STEP_SECONDS);
}

function sweep() {
  const oldest = currentStep() - WINDOW_STEPS - 1;
  for (const [userId, steps] of used) {
    for (const step of steps) if (step < oldest) steps.delete(step);
    if (steps.size === 0) used.delete(userId);
  }
}

// true — шаг ещё не использовался и теперь помечен; false — повтор.
function claim(userId, step) {
  sweep();
  let steps = used.get(userId);
  if (!steps) used.set(userId, (steps = new Set()));
  if (steps.has(step)) return false;
  steps.add(step);
  return true;
}

// Новый секрет — прежние шаги к нему отношения не имеют.
function forget(userId) {
  used.delete(userId);
}

module.exports = { claim, forget };
