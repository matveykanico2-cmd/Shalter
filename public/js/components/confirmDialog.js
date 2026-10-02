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
