import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { getState } from "../state.js";

export function openForwardDialog(onPick, { count = 1, allowHideAuthor = false, excludeChats = [] } = {}) {
  const { chats } = getState();
  const skip = new Set(excludeChats.filter(Boolean));
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const titleOf = (c) => (c.isSaved ? "Избранное" : (c.otherUser?.name ?? c.title ?? ""));
  const candidates = chats
    .filter((c) => (!c.archived || c.isSaved) && !c.secret && !skip.has(c.id))
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
                await onPick(c.id, { hideAuthor: hideAuthor.checked });
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

  // Как в Telegram: «Скрыть имя отправителя» — сообщение уходит как своё, без подписи «Переслано от».
  const hideAuthor = el("input", { type: "checkbox" });
  const hideAuthorRow = allowHideAuthor
    ? el("label", { class: "forward-hide-author" }, [hideAuthor, el("span", {}, "Скрыть имя отправителя")])
    : null;

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, count > 1 ? `Переслать сообщения (${count})` : "Переслать сообщение"),
    search,
    list,
    hideAuthorRow,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  if (window.matchMedia?.("(pointer: fine)").matches) search.focus();
  return close;
}
