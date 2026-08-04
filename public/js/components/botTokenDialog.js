import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Shown once right after a bot is created (and again after "Обновить
// токен") — the token is never shown anywhere else, so this is the only
// chance to copy it before it's gone from view.
export function openBotTokenDialog(botName, token) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const copiedNote = el("p", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, `Токен бота «${botName}»`),
    el("p", { class: "settings-toggle-hint" }, "Сохраните его сейчас — второй раз он нигде не показывается. Если потеряете, его можно обновить (старый перестанет работать)."),
    el("div", { class: "referral-code-row" }, [
      el("span", { class: "mono bot-token-value" }, token),
      el("button", {
        class: "icon-btn",
        title: "Скопировать токен",
        html: iconSvg("Copy", 16),
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(token);
            copiedNote.textContent = "Скопировано ✓";
          } catch {
            copiedNote.textContent = "Не удалось скопировать — выделите вручную";
          }
        },
      }),
    ]),
    copiedNote,
    el("p", { class: "settings-toggle-hint" }, [
      "Как этим пользоваться — ",
      el("a", { href: "/BOTS.md", target: "_blank", rel: "noreferrer", class: "text-link" }, "документация по Bot API"),
      ".",
    ]),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Готово"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
