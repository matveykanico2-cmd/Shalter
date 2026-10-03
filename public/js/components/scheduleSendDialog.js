import { el } from "../lib/dom.js";

export const REPEAT_OPTIONS = [
  ["", "Не повторять"],
  ["day", "Каждый день"],
  ["week", "Каждую неделю"],
  ["2weeks", "Каждые 2 недели"],
  ["month", "Каждый месяц"],
  ["3months", "Каждые 3 месяца"],
  ["6months", "Каждые 6 месяцев"],
  ["year", "Каждый год"],
];

export function repeatLabel(repeat) {
  return REPEAT_OPTIONS.find(([id]) => id === repeat)?.[1] ?? "";
}

// onSchedule(iso, repeat, { whenOnline }) — repeat: null или один из REPEAT_OPTIONS;
// при whenOnline iso и repeat — null.
export function openScheduleSendDialog(onSchedule, { allowRepeat = true, allowWhenOnline = false } = {}) {
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
  const repeatSelect = el(
    "select",
    { class: "settings-input", "aria-label": "Повтор" },
    REPEAT_OPTIONS.map(([id, label]) => el("option", { value: id }, label))
  );

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Отправить позже"),
    input,
    allowRepeat ? el("label", { class: "schedule-repeat" }, [el("span", {}, "Повтор"), repeatSelect]) : null,
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
          onSchedule(iso, allowRepeat && repeatSelect.value ? repeatSelect.value : null);
        },
      },
      "Запланировать"
    ),
    // Как в Telegram: в личке — «Отправить, когда будет в сети».
    allowWhenOnline
      ? el(
          "button",
          {
            class: "modal-cancel",
            onclick: () => {
              close();
              onSchedule(null, null, { whenOnline: true });
            },
          },
          "Отправить, когда будет в сети"
        )
      : null,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
