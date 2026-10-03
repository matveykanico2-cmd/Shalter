import { el } from "../lib/dom.js";

export function openChoiceDialog(title, options) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "modal-dialog choice-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    ...options.map((opt) =>
      el(
        "button",
        {
          class: `choice-dialog-btn ${opt.danger ? "danger" : ""}`,
          onclick: () => {
            close();
            opt.onClick();
          },
        },
        opt.label
      )
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  return close;
}

export function openCheckboxDialog({ title, text, checkbox = null, confirmLabel = "OK", danger = false, extra = [], onConfirm }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const input = checkbox ? el("input", { type: "checkbox", class: "confirm-check-input" }) : null;
  if (input) input.checked = !!checkbox.checked;

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  const dialog = el("div", { class: "modal-dialog choice-dialog confirm-check-dialog" }, [
    title ? el("h2", { class: "modal-title" }, title) : null,
    text ? el("p", { class: "confirm-check-text" }, text) : null,
    input ? el("label", { class: "confirm-check-row" }, [input, el("span", {}, checkbox.label)]) : null,
    ...extra.map((opt) =>
      el(
        "button",
        {
          class: `choice-dialog-btn confirm-check-extra ${opt.danger ? "danger" : ""}`,
          onclick: () => {
            close();
            opt.onClick();
          },
        },
        opt.label
      )
    ),
    el("div", { class: "confirm-check-actions" }, [
      el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
      el(
        "button",
        {
          class: `confirm-check-ok ${danger ? "danger" : ""}`,
          onclick: () => {
            const checked = !!input?.checked;
            close();
            onConfirm?.(checked);
          },
        },
        confirmLabel
      ),
    ]),
  ]);
  overlay.appendChild(dialog);

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return close;
}

// Замена window.confirm в стиле tweb (confirmationPopup): асинхронно, Promise<boolean>.
// Первая строка вопроса — заголовок, остальное — пояснение; кнопка называется глаголом из вопроса.
const DANGER_RE = /^(удалить|заблокировать|завершить|отписаться|убрать|выйти|сбросить|отключить|остановить|отменить|скрыть|обменять|выключить|перегенерировать|обновить токен)/i;

export function askConfirm(message, { okLabel, cancelLabel = "Отмена", danger } = {}) {
  const textAll = String(message ?? "");
  const [head, ...rest] = textAll.split(/\n\s*\n/);
  const verb = head.match(/^([А-ЯЁA-Z][а-яёa-z]+(?:ть|ться))(?=[\s?,.!]|$)/)?.[1];
  const isDanger = danger ?? DANGER_RE.test(head);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(v);
    };
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      }
    }
    const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && finish(false) });
    const okBtn = el("button", { class: `confirm-check-ok ${isDanger ? "danger" : ""}`, onclick: () => finish(true) }, okLabel ?? verb ?? "OK");
    overlay.appendChild(
      el("div", { class: "modal-dialog choice-dialog confirm-check-dialog tw-confirm" }, [
        el("h2", { class: "modal-title" }, head),
        rest.length ? el("p", { class: "confirm-check-text" }, rest.join("\n\n")) : null,
        el("div", { class: "confirm-check-actions" }, [
          el("button", { class: "modal-cancel", onclick: () => finish(false) }, cancelLabel),
          okBtn,
        ]),
      ])
    );
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

// Замена window.prompt: окно tweb с полем ввода. Promise<string|null> — null при отмене, как у prompt.
export function askText(message, defaultValue = "", { okLabel = "OK", multiline } = {}) {
  const textAll = String(message ?? "");
  const [head, ...rest] = textAll.split(/\n\s*\n/);
  const isMulti = multiline ?? false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(v);
    };
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(null);
      } else if (e.key === "Enter" && (!isMulti || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        finish(input.value);
      }
    }
    const input = el(isMulti ? "textarea" : "input", { class: "tw-input", placeholder: " ", rows: isMulti ? 3 : null });
    input.value = defaultValue ?? "";
    const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && finish(null) });
    overlay.appendChild(
      el("div", { class: "modal-dialog choice-dialog confirm-check-dialog tw-confirm" }, [
        el("h2", { class: "modal-title" }, head),
        rest.length ? el("p", { class: "confirm-check-text" }, rest.join("\n\n")) : null,
        el("label", { class: "tw-input-field tw-ask-field" }, [input]),
        el("div", { class: "confirm-check-actions" }, [
          el("button", { class: "modal-cancel", onclick: () => finish(null) }, "Отмена"),
          el("button", { class: "confirm-check-ok", onclick: () => finish(input.value) }, okLabel),
        ]),
      ])
    );
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    input.focus();
    input.select?.();
  });
}
