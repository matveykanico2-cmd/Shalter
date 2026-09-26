import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Показ ключей приложения «Войти через Shalter» — client_id и client_secret с
// копированием. Открывается после создания/перевыпуска и по кнопке «Показать
// ключ», как «Показать токен» у бота (components/botTokenDialog.js).
export function openOAuthSecretDialog(appName, { clientId, clientSecret }, { fresh = true } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const note = el("p", { class: "settings-toggle-hint" });

  const row = (label, value) =>
    el("div", { class: "referral-code-row" }, [
      el("span", { class: "mono bot-token-value" }, `${label}: ${value}`),
      el("button", {
        class: "icon-btn",
        title: `Скопировать ${label}`,
        html: iconSvg("Copy", 16),
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(value);
            note.textContent = `${label} скопирован ✓`;
          } catch {
            note.textContent = "Не удалось скопировать — выделите вручную";
          }
        },
      }),
    ]);

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, `Ключ приложения «${appName}»`),
    el(
      "p",
      { class: "settings-toggle-hint" },
      fresh
        ? "Сохраните client_secret. Посмотреть снова можно кнопкой с ключом рядом с приложением; перевыпуск делает старый секрет недействительным."
        : "Это действующий ключ приложения. client_secret держите только на сервере — в браузер его отдавать нельзя."
    ),
    row("client_id", clientId),
    row("client_secret", clientSecret),
    note,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Готово"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
