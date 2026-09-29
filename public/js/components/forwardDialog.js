import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { getState } from "../state.js";

// Выбор, куда переслать: чаты из списка слева. «Избранное» — первым, как в
// Telegram: переслать себе на память — самый частый случай. Поле поиска —
// потому что при сотне чатов нужный иначе приходится искать прокруткой.
//
// onPick может быть асинхронным: окно закрывается сразу, а ошибка пересылки
// (нельзя писать в этот чат, собеседник заблокировал) показывается словами, а
// не пропадает молча в консоли.
export function openForwardDialog(onPick, { count = 1 } = {}) {
  const { chats } = getState();
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const titleOf = (c) => (c.isSaved ? "Избранное" : (c.otherUser?.name ?? c.title ?? ""));
  const candidates = chats
    .filter((c) => !c.archived || c.isSaved)
    .sort((a, b) => (b.isSaved ? 1 : 0) - (a.isSaved ? 1 : 0));

  const list = el("div", { class: "forward-list" });
  const search = el("input", {
    class: "login-input forward-search",
    type: "search",
    placeholder: "Поиск",
    oninput: () => renderList(),
  });

  function renderList() {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const shown = q ? candidates.filter((c) => titleOf(c).toLowerCase().includes(q)) : candidates;
    if (!shown.length) {
      list.appendChild(el("p", { class: "empty-hint" }, "Ничего не найдено"));
      return;
    }
    for (const c of shown) {
      list.appendChild(
        el(
          "button",
          {
            class: "forward-row",
            onclick: async () => {
              close();
              try {
                await onPick(c.id);
              } catch (err) {
                alert(err?.message || "Не удалось переслать");
              }
            },
          },
          [
            c.isSaved
              ? el("span", { class: "saved-avatar forward-saved-avatar", html: iconSvg("Bookmark", 18) })
              : Avatar({ name: titleOf(c), color: c.otherUser?.avatarColor ?? c.avatarColor, image: c.otherUser ? c.otherUser.avatarImage : c.avatarImage, size: 36 }),
            el("span", {}, titleOf(c)),
          ]
        )
      );
    }
  }
  renderList();

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, count > 1 ? `Переслать сообщения (${count})` : "Переслать сообщение"),
    search,
    list,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  // На телефоне клавиатура сама не выезжает — фокус только на широком экране.
  if (window.matchMedia?.("(pointer: fine)").matches) search.focus();
  return close;
}
