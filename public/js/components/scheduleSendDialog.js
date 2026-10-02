import { el } from "../lib/dom.js";

export function openScheduleSendDialog(onSchedule) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  function toLocalInputValue(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const defaultAt = new Date(Date.now() + 5 * 60 * 1000);
  defaultAt.setSeconds(0, 0);
  const input = el("input", {
    type: "datetime-local",
    class: "settings-input",
    value: toLocalInputValue(defaultAt),
    min: toLocalInputValue(new Date()),
  });
  const errorSlot = el("p", { class: "login-error" });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Отправить позже"),
    input,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          if (!input.value) {
            errorSlot.textContent = "Выберите дату и время";
            return;
          }
          const iso = new Date(input.value).toISOString();
          if (iso <= new Date().toISOString()) {
            errorSlot.textContent = "Время должно быть в будущем";
            return;
          }
          close();
          onSchedule(iso);
        },
      },
      "Запланировать"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
