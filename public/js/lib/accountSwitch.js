import { api } from "../api.js";
import { el } from "./dom.js";

// Переключение аккаунта: сразу закрываем экран оверлеем, чтобы при перезагрузке
// не мелькал старый аккаунт, пока грузится выбранный.
export async function switchAccount(userId) {
  const overlay = el("div", { class: "account-switch-overlay" }, el("span", {}, "Переключаем аккаунт…"));
  document.body.appendChild(overlay);
  try {
    await api.switchAccount(userId);
  } catch (err) {
    overlay.remove();
    alert(err.message || "Не удалось переключить аккаунт");
    return;
  }
  window.location.reload();
}
