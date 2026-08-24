import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { ChatListItem } from "../components/chatListItem.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";

export async function ArchiveView(root) {
  const { chats: all } = await api.listChats();
  let chats = all.filter((c) => c.archived);
  const me = getState().user;

  function render() {
    const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
    const list = el(
      "div",
      { class: "chat-list-scroll" },
      chats.length === 0
        ? // Пустой архив объясняет, чем он вообще наполняется: до этой правки
          // экран состоял из двух слов и не подсказывал, что делать.
          el("p", { class: "empty-hint" }, "В архиве пусто — потяните строку чата влево, чтобы убрать его сюда")
        : [
            // Заголовок со счётчиком — тот же, что во всех остальных вкладках.
            el("p", { class: "list-section-label" }, `В архиве — ${chats.length}`),
            ...chats.map((c) => ChatListItem({ chat: c, active: currentId === c.id, meId: me.id, onPatch: patchChat, onDelete: deleteChatItem })),
          ]
    );
    mount(
      root,
      el("div", { class: "contacts-view" }, [
        el("header", { class: "contacts-header" }, [
          el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
          el("p", { class: "view-title" }, "Архив"),
        ]),
        list,
      ])
    );
  }

  async function patchChat(id, patch) {
    if (patch.archived === false) {
      chats = chats.filter((c) => c.id !== id);
    } else {
      chats = chats.map((c) => (c.id === id ? { ...c, ...patch } : c));
    }
    render();
    await api.patchChat(id, patch);
  }

  async function deleteChatItem(id, forEveryone) {
    chats = chats.filter((c) => c.id !== id);
    render();
    if (window.location.pathname === `/chat/${id}`) navigate("/");
    if (forEveryone) await api.deleteChat(id);
    else await api.deleteChatForMe(id);
  }

  render();
}
