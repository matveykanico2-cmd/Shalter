import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

const MAX_ITEMS = 30;

// onCreate(title, items, { othersCanAdd, othersCanMark })
export function openChecklistDialog(onCreate) {
  let count = 3;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const titleInput = el("input", { class: "login-input", placeholder: "Название списка", maxlength: 200 });
  const itemsSlot = el("div", { class: "poll-options-list" });
  const errorSlot = el("p", { class: "login-error" });
  const markBox = el("input", { type: "checkbox", checked: true });
  const addBox = el("input", { type: "checkbox" });

  function renderItems() {
    const typed = [...itemsSlot.querySelectorAll(".poll-option-input")].map((i) => i.value);
    itemsSlot.textContent = "";
    for (let i = 0; i < count; i++) {
      const input = el("input", { class: "settings-input poll-option-input", placeholder: `Пункт ${i + 1}`, maxlength: 200 });
      input.value = typed[i] ?? "";
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && i === count - 1 && count < MAX_ITEMS) {
          e.preventDefault();
          count++;
          renderItems();
          itemsSlot.querySelectorAll(".poll-option-input")[count - 1]?.focus();
        }
      });
      itemsSlot.appendChild(input);
    }
    if (count < MAX_ITEMS) {
      itemsSlot.appendChild(
        el("button", { class: "choice-dialog-btn", onclick: () => ((count += 1), renderItems()) }, [el("span", { html: iconSvg("Plus", 14) }), " Добавить пункт"])
      );
    }
  }
  renderItems();

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Новый чек-лист"),
    titleInput,
    itemsSlot,
    el("label", { class: "poll-multiple-row" }, [markBox, el("span", {}, "Другие могут отмечать пункты")]),
    el("label", { class: "poll-multiple-row" }, [addBox, el("span", {}, "Другие могут добавлять пункты")]),
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          const items = [...itemsSlot.querySelectorAll(".poll-option-input")].map((i) => i.value.trim()).filter(Boolean);
          if (!items.length) {
            errorSlot.textContent = "Добавьте хотя бы один пункт";
            return;
          }
          close();
          onCreate(titleInput.value.trim() || "Чек-лист", items, { othersCanMark: markBox.checked, othersCanAdd: addBox.checked });
        },
      },
      "Создать"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);
  function close() {
    overlay.remove();
  }
  document.body.appendChild(overlay);
  titleInput.focus();
}
