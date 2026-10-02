import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";

export async function openContactPickerDialog(onPick, title = "Отправить контакт", { extra = [] } = {}) {
  const { contacts } = await api.listContacts();
  const seen = new Set(contacts.map((c) => c.user.id));
  const people = [
    ...contacts.map((c) => c.user),
    ...extra.filter((u) => u && u.id && !seen.has(u.id)),
  ];
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const list = el(
    "div",
    { class: "forward-list" },
    people.length === 0
      ? el("p", { class: "empty-hint" }, "Список контактов пуст")
      : people.map((user) =>
          el(
            "button",
            {
              class: "forward-row",
              onclick: () => {
                onPick(user);
                close();
              },
            },
            [Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 36 }), el("span", {}, user.name)]
          )
        )
  );
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    list,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
