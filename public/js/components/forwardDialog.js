import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { getState } from "../state.js";

// Как в Telegram: касание отмечает чат, отправить можно сразу нескольким (или всем).
export function openForwardDialog(onPick, { count = 1, allowHideAuthor = false, excludeChats = [], title = null } = {}) {
  const { chats } = getState();
  const skip = new Set(excludeChats.filter(Boolean));
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const titleOf = (c) => (c.isSaved ? "Избранное" : (c.otherUser?.name ?? c.title ?? ""));
  const candidates = chats
    .filter((c) => (!c.archived || c.isSaved) && !c.secret && !skip.has(c.id))
    .sort((a, b) => (b.isSaved ? 1 : 0) - (a.isSaved ? 1 : 0));

  const list = el("div", { class: "forward-list" });
  const selected = new Set();
  let sending = false;
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
            class: `forward-row ${selected.has(c.id) ? "is-selected" : ""}`,
            onclick: (e) => {
              if (sending) return;
              if (selected.has(c.id)) selected.delete(c.id);
              else selected.add(c.id);
              e.currentTarget.classList.toggle("is-selected", selected.has(c.id));
              syncFooter();
            },
          },
          [
            c.isSaved
              ? el("span", { class: "saved-avatar forward-saved-avatar", html: iconSvg("Bookmark", 18) })
              : Avatar({ name: titleOf(c), color: c.otherUser?.avatarColor ?? c.avatarColor, image: c.otherUser ? c.otherUser.avatarImage : c.avatarImage, size: 36 }),
            el("span", { class: "forward-row-title" }, titleOf(c)),
            el("span", { class: "forward-row-check", html: iconSvg("Check", 14) }),
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

  const allBtn = el("button", { class: "forward-all-btn", type: "button", onclick: () => toggleAll() });
  const sendBtn = el("button", { class: "btn-primary forward-send-btn", type: "button", onclick: () => sendAll() });
  function visibleChats() {
    const q = search.value.trim().toLowerCase();
    return q ? candidates.filter((c) => titleOf(c).toLowerCase().includes(q)) : candidates;
  }
  function syncFooter() {
    const shown = visibleChats();
    const allOn = shown.length > 0 && shown.every((c) => selected.has(c.id));
    allBtn.textContent = allOn ? "Снять выбор" : "Выбрать всех";
    allBtn.hidden = !shown.length;
    sendBtn.disabled = !selected.size || sending;
    if (!sending) sendBtn.textContent = selected.size ? `Отправить (${selected.size})` : "Выберите чаты";
  }
  function toggleAll() {
    const shown = visibleChats();
    const allOn = shown.every((c) => selected.has(c.id));
    for (const c of shown) allOn ? selected.delete(c.id) : selected.add(c.id);
    renderList();
    syncFooter();
  }
  async function sendAll() {
    if (!selected.size || sending) return;
    sending = true;
    const ids = candidates.filter((c) => selected.has(c.id)).map((c) => c.id);
    let failed = 0;
    let lastError = null;
    for (let i = 0; i < ids.length; i++) {
      sendBtn.textContent = ids.length > 1 ? `Отправляем… ${i + 1}/${ids.length}` : "Отправляем…";
      sendBtn.disabled = true;
      try {
        await onPick(ids[i], { hideAuthor: hideAuthor.checked });
      } catch (err) {
        failed++;
        lastError = err;
      }
    }
    close();
    if (failed) alert(`${lastError?.message || "Не удалось отправить"}${ids.length > 1 ? ` (не ушло в ${failed} из ${ids.length})` : ""}`);
  }
  search.addEventListener("input", syncFooter);

  const dialog = el("div", { class: "modal-dialog forward-dialog" }, [
    el("h2", { class: "modal-title" }, title ?? (count > 1 ? `Переслать сообщения (${count})` : "Переслать сообщение")),
    search,
    list,
    hideAuthorRow,
    el("div", { class: "forward-footer" }, [
      allBtn,
      el("div", { class: "forward-footer-actions" }, [el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"), sendBtn]),
    ]),
  ]);
  syncFooter();
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  if (window.matchMedia?.("(pointer: fine)").matches) search.focus();
  return close;
}
