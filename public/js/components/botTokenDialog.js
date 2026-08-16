import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Показывается после создания бота, после перевыпуска токена и по кнопке
// «Показать токен».
//
// `fresh` меняет только надпись, и это важно: раньше здесь стояло «второй раз
// он нигде не показывается», и это было правдой — токен нельзя было посмотреть,
// только перевыпустить, ломая работающего бота. Теперь можно, и обещать
// обратное нельзя.
export function openBotTokenDialog(botName, token, { fresh = true } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const copiedNote = el("p", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, `Токен бота «${botName}»`),
    el(
      "p",
      { class: "settings-toggle-hint" },
      fresh
        ? "Сохраните его. Посмотреть снова можно кнопкой с ключом рядом с ботом; перевыпуск делает старый токен недействительным."
        : "Это действующий токен бота. Кто им владеет — тот и есть бот, поэтому не публикуйте его."
    ),
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
      el("a", { href: "/bots", target: "_blank", rel: "noreferrer", class: "text-link" }, "документация по Bot API"),
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
