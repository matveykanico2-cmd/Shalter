import { el } from "../lib/dom.js";

// Small modal offering a few mutually-exclusive choices (e.g. "delete for
// everyone" vs "delete for me") — reuses the same modal-* CSS as ForwardDialog.
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
