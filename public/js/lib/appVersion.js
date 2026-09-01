import { api } from "../api.js";

// Тихое обновление приложения, когда на сервере выложили новую версию.
//
// Зачем: страница, открытая днём раньше, продолжает работать со старым кодом.
// Он общается с новым сервером — и это ровно те «глюки», которые чинятся
// перезагрузкой, о необходимости которой человек не догадывается: то кнопка не
// работает, то ответ не разбирается.
//
// Почему не «перезагружать постоянно», как просят обычно: перезагрузка посреди
// работы стирает набранный текст, роняет звонок и сбрасывает прокрутку. Она
// незаметна ровно тогда, когда делается в спокойный момент, — этим здесь и
// занимаемся: ждём, пока обновляться станет безопасно.
const CHECK_EVERY_MS = 5 * 60 * 1000;
const IDLE_BEFORE_RELOAD_MS = 30 * 1000;

let known = null;
let pending = false;
let lastActivity = Date.now();

function markActivity() {
  lastActivity = Date.now();
}

// Что считается «сейчас перезагружать нельзя».
function isBusy() {
  // Идёт звонок — перезагрузка его разорвёт.
  if (document.querySelector(".call-screen, .incoming-call-screen, .live-overlay, .call-pip")) return true;
  // Что-то набрано и не отправлено — потерять это недопустимо.
  for (const field of document.querySelectorAll("input, textarea, [contenteditable='true']")) {
    const value = field.value ?? field.textContent ?? "";
    if (value.trim() && field.type !== "search") return true;
  }
  // Открыто модальное окно — человек в середине действия.
  if (document.querySelector(".modal-overlay")) return true;
  // Только что что-то делали руками.
  if (Date.now() - lastActivity < IDLE_BEFORE_RELOAD_MS) return true;
  return false;
}

function reloadNow() {
  // replace, а не reload: не плодим запись в истории, чтобы «назад» вело туда
  // же, куда вело бы без обновления.
  window.location.replace(window.location.href);
}

async function check() {
  try {
    const { version } = await api.getAppVersion();
    if (!version || version === "dev") return; // в разработке ничего не трогаем
    if (known === null) {
      known = version;
      return;
    }
    if (version !== known) pending = true;
  } catch {
    // Сервер недоступен — не наше дело, следующая проверка разберётся.
  }
  if (pending && !isBusy()) reloadNow();
}

export function startVersionWatch() {
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(ev, markActivity, { passive: true });
  }
  check();
  setInterval(check, CHECK_EVERY_MS);
  // Возвращение к вкладке — самый удобный момент: человек только что пришёл,
  // ничего не набирает, и обновление пройдёт незамеченным.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
