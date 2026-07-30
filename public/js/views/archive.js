import { el, mount, clear } from "../lib/dom.js";
import { ChatListItem } from "../components/chatListItem.js";
import { api } from "../api.js";
import { getState } from "../state.js";

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
        ? el("p", { class: "empty-hint" }, "В архиве пусто")
        : chats.map((c) => ChatListItem({ chat: c, active: currentId === c.id, meId: me.id, onPatch: patchChat }))
    );
    mount(
      root,
      el("div", { class: "contacts-view" }, [
        el("header", { class: "contacts-header" }, [el("p", { class: "view-title" }, "Архив")]),
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

  render();
}
