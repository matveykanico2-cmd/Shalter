import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

// Multi-select contact list — used both to pick initial members (+ who among
// them starts as admin) when creating a group/channel, and to add members to
// an existing one. excludeIds hides contacts already in the chat; allowRoles
// shows a per-selected-contact "make admin" toggle and makes onConfirm's
// result { userIds, adminIds } instead of a plain array.
export async function openMemberPickerDialog(onConfirm, { title = "Участники группы", submitLabel = "Создать группу", excludeIds = [], allowRoles = false } = {}) {
  const { contacts } = await api.listContacts();
  const exclude = new Set(excludeIds);
  const available = contacts.filter(({ user }) => !exclude.has(user.id));
  const selected = new Set();
  const admins = new Set();

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const list = el(
    "div",
    { class: "forward-list" },
    available.length === 0
      ? el("p", { class: "empty-hint" }, "Список контактов пуст")
      : available.map(({ user }) => {
          const adminToggle = allowRoles
            ? el("button", {
                class: "member-picker-admin-toggle",
                title: "Сделать администратором",
                html: iconSvg("Shield", 14),
                onclick: (e) => {
                  e.preventDefault();
                  if (!selected.has(user.id)) return;
                  if (admins.has(user.id)) admins.delete(user.id);
                  else admins.add(user.id);
                  e.currentTarget.classList.toggle("active", admins.has(user.id));
                },
              })
            : null;
          return el("label", { class: "forward-row member-picker-row" }, [
            el("input", {
              type: "checkbox",
              onchange: (e) => {
                if (e.target.checked) selected.add(user.id);
                else {
                  selected.delete(user.id);
                  admins.delete(user.id);
                }
              },
            }),
            Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 32 }),
            el("span", { class: "member-picker-name" }, user.name),
            adminToggle,
          ]);
        })
  );
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    allowRoles ? el("p", { class: "settings-toggle-hint" }, "Нажмите на значок щита рядом с отмеченным контактом, чтобы сразу сделать его администратором.") : null,
    list,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          close();
          if (allowRoles) onConfirm({ userIds: [...selected], adminIds: [...admins] });
          else onConfirm([...selected]);
        },
      },
      submitLabel
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
