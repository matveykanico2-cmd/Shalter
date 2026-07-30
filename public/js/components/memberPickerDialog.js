import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";

// Multi-select contact list — used to pick initial members for a new group.
export async function openMemberPickerDialog(onConfirm) {
  const { contacts } = await api.listContacts();
  const selected = new Set();

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const list = el(
    "div",
    { class: "forward-list" },
    contacts.length === 0
      ? el("p", { class: "empty-hint" }, "Список контактов пуст")
      : contacts.map(({ user }) =>
          el("label", { class: "forward-row member-picker-row" }, [
            el("input", {
              type: "checkbox",
              onchange: (e) => (e.target.checked ? selected.add(user.id) : selected.delete(user.id)),
            }),
            Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 32 }),
            el("span", {}, user.name),
          ])
        )
  );
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Участники группы"),
    list,
    el("button", { class: "btn-accent poll-create-btn", onclick: () => { close(); onConfirm([...selected]); } }, "Создать группу"),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
