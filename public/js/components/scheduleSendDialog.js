import { el } from "../lib/dom.js";

// Opened from the composer's clock icon (composer.js) — picks when the
// currently-typed message should actually go out. The actual delivery
// later is server/lib/scheduledMessagesSweep.js's job; this dialog just
// hands back the chosen moment as an ISO timestamp.
export function openScheduleSendDialog(onSchedule) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  // datetime-local wants "local wall-clock time, no offset" — shifting by
  // getTimezoneOffset() before slicing is the standard way to turn a UTC
  // Date into that format without a date library.
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
