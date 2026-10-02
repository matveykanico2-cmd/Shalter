import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { ChatListItem } from "../components/chatListItem.js";
import { api } from "../api.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";
import { sortChats } from "../lib/chatSort.js";

export async function ArchiveView(root) {
  const me = getState().user;

  function archived() {
    return sortChats((getState().chats ?? []).filter((c) => c.archived));
  }

  function openChat(id) {
    setState({ sidebarArchive: true });
    navigate(`/chat/${id}`);
  }

  function render() {
    const chats = archived();
    const list = el(
      "div",
      { class: "chat-list-scroll" },
      chats.length === 0
        ?
          el("p", { class: "empty-hint" }, "В архиве пусто — потяните строку чата влево или нажмите «⋮» → «Архивировать»")
        : [
            el("p", { class: "list-section-label" }, `В архиве — ${chats.length}`),
            el("p", { class: "archive-hint" }, "Чаты с включёнными уведомлениями возвращаются из архива, когда в них приходит новое сообщение. Заглушённые остаются здесь."),
            ...chats.map((c) =>
              ChatListItem({
                chat: c,
                active: false,
                meId: me.id,
                onPatch: patchChat,
                onMute: muteChatFor,
                onDelete: deleteChatItem,
                onLeave: leaveChatItem,
                onOpen: openChat,
                onRead: markReadLocally,
              })
            ),
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

  async function reload() {
    const r = await api.listChats();
    setState({ chats: r.chats });
  }

  async function patchChat(id, patch) {
    const before = getState().chats;
    setState({ chats: before.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    try {
      await api.patchChat(id, patch);
    } catch (err) {
      alert(err.message || "Не удалось изменить чат");
      await reload().catch(() => {});
    }
  }

  async function muteChatFor(id, opts) {
    try {
      const { chat: updated } = await api.muteChat(id, opts);
      setState({ chats: getState().chats.map((c) => (c.id === id ? { ...c, ...updated } : c)) });
    } catch (err) {
      alert(err.message || "Не удалось изменить уведомления");
    }
  }

  function markReadLocally(id) {
    setState({ chats: getState().chats.map((c) => (c.id === id ? { ...c, unreadCount: 0, hasUnreadMention: false } : c)) });
  }

  async function deleteChatItem(id, forEveryone) {
    setState({ chats: getState().chats.filter((c) => c.id !== id) });
    try {
      if (forEveryone) await api.deleteChat(id);
      else await api.deleteChatForMe(id);
    } catch (err) {
      alert(err.message || "Не удалось удалить чат");
      await reload().catch(() => {});
    }
  }

  async function leaveChatItem(id) {
    setState({ chats: getState().chats.filter((c) => c.id !== id) });
    try {
      await api.leaveChat(id);
    } catch (err) {
      alert(err.message || "Не удалось выйти из чата");
      await reload().catch(() => {});
    }
  }

  const unsub = subscribe(render);
  root._cleanup = () => unsub();

  render();
  await reload().catch(() => {});
}
