import { el } from "../lib/dom.js";

// Всплывающее уведомление внизу экрана, как toast в tweb.
let timer = null;

export function showToast(text, { duration } = {}) {
  const message = String(text ?? "").trim();
  if (!message) return;
  let t = document.querySelector(".tw-toast");
  if (!t) {
    t = el("div", { class: "tw-toast", role: "status", "aria-live": "polite" });
    document.body.appendChild(t);
  }
  t.textContent = message;
  // Перезапуск анимации, если тост уже на экране.
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove("show"), duration ?? Math.min(6000, 2200 + message.length * 40));
}

// window.alert блокирует страницу и выглядит как системное окно — показываем тост.
export function installToastAlert() {
  window.alert = (text) => showToast(text);
}

// Esc закрывает верхнее модальное окно — у многих окон своего обработчика нет.
// Окно запоминаем до остальных обработчиков: если оно закрылось само, второе не трогаем.
export function installModalEscape() {
  let top = null;
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      const overlays = document.querySelectorAll(".modal-overlay");
      top = overlays[overlays.length - 1] ?? null;
    },
    true
  );
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !top) return;
    const target = top;
    top = null;
    if (!target.isConnected) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // окно без закрытия по клику на фон — убираем принудительно
    if (target.isConnected && target.classList.contains("modal-overlay")) target.remove();
  });
}
