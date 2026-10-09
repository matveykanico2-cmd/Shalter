import { api, rememberSwitchedAccount } from "../api.js";
import { el } from "./dom.js";

// Переключение аккаунта: сразу закрываем экран оверлеем, чтобы при перезагрузке
// не мелькал старый аккаунт, пока грузится выбранный.
export async function switchAccount(userId, { to = null } = {}) {
  const overlay = el("div", { class: "account-switch-overlay" }, el("span", {}, "Переключаем аккаунт…"));
  document.body.appendChild(overlay);
  try {
    const { user } = await api.switchAccount(userId);
    rememberSwitchedAccount(user);
  } catch (err) {
    overlay.remove();
    alert(err.message || "Не удалось переключить аккаунт");
    return;
  }
  if (to) window.location.href = to;
  else window.location.reload();
}
