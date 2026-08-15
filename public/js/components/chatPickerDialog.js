import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { getState } from "../state.js";

// Pick one of your own groups. Used for wiring a channel to its discussion
// group; deliberately a separate component from forwardDialog.js, which picks
// *any* chat to send something to — this one filters to the groups you could
// actually link, so the list can't offer a channel or a DM that would be
// refused by the server a moment later.
export function openChatPickerDialog(onPick, title = "Выберите группу") {
  const { chats, user } = getState();
  const groups = chats.filter((c) => c.type === "group" && !c.archived);

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = groups.length
    ? el(
        "div",
        { class: "forward-list" },
        groups.map((c) =>
          el(
            "button",
            {
              class: "forward-row",
              onclick: () => {
                close();
                onPick(c.id);
              },
            },
            [
              Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 36 }),
              el("div", {}, [
                el("p", { class: "forward-row-title" }, c.title),
                el("p", { class: "settings-toggle-hint" }, `${c.memberIds?.length ?? 0} участников`),
              ]),
            ]
          )
        )
      )
    : el("p", { class: "empty-hint" }, "У вас пока нет групп — создайте её, и она появится здесь");

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
