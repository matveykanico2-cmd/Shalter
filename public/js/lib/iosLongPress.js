// iPhone и iPad не присылают contextmenu на долгое нажатие (Android присылает), и всё,
// что открывается правым кликом — меню вкладки папок, историй, тем, сообществ, —
// на iOS было недоступно. Долгое нажатие пальцем превращаем в contextmenu сами.
// Где у элемента есть своё долгое нажатие (сообщения, строки чатов, поле ввода), не вмешиваемся.
const HOLD_MS = 450;
const MOVE_PX = 10;
const OWN_LONG_PRESS = ".bubble-wrap, .chat-list-item, .composer, input, textarea, [contenteditable='true'], video, audio";

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function installIosLongPress() {
  if (!isIos()) return;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let firedAt = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      cancel();
      if (e.pointerType !== "touch" || !(e.target instanceof Element) || e.target.closest(OWN_LONG_PRESS)) return;
      const target = e.target;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: startX, clientY: startY, view: window });
        target.dispatchEvent(ev);
        // Кто-то открыл своё меню (отменил событие) — отпускание пальца не должно ещё и «нажать».
        if (ev.defaultPrevented) {
          firedAt = Date.now();
          navigator.vibrate?.(12);
        }
      }, HOLD_MS);
    },
    { passive: true }
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (timer && (Math.abs(e.clientX - startX) > MOVE_PX || Math.abs(e.clientY - startY) > MOVE_PX)) cancel();
    },
    { passive: true }
  );
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, cancel, { passive: true });
  document.addEventListener(
    "click",
    (e) => {
      if (Date.now() - firedAt < 800) {
        e.preventDefault();
        e.stopPropagation();
        firedAt = 0;
      }
    },
    true
  );
}
