import { el, mount } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { getState } from "../state.js";

// Minimal vanilla-JS port of components/chat/ForwardDialog.tsx: pick a
// destination chat from the ones already in the sidebar list.
export function openForwardDialog(onPick) {
  const { chats } = getState();
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const list = el(
    "div",
    { class: "forward-list" },
    chats
      .filter((c) => !c.archived)
      .map((c) =>
        el(
          "button",
          {
            class: "forward-row",
            onclick: () => {
              onPick(c.id);
              close();
            },
          },
          [
            Avatar({ name: c.otherUser?.name ?? c.title, color: c.avatarColor, image: c.otherUser?.avatarImage, size: 36 }),
            el("span", {}, c.otherUser?.name ?? c.title),
          ]
        )
      )
  );
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Переслать сообщение"),
    list,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  return close;
}
