import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";

// Pick one of your contacts — used both to send a "contact card" attachment
// and (with a different title) to start a new private chat.
export async function openContactPickerDialog(onPick, title = "Отправить контакт") {
  const { contacts } = await api.listContacts();
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const list = el(
    "div",
    { class: "forward-list" },
    contacts.length === 0
      ? el("p", { class: "empty-hint" }, "Список контактов пуст")
      : contacts.map(({ user }) =>
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
