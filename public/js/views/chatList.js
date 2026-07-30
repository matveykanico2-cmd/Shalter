import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { ChatListItem } from "../components/chatListItem.js";
import { api } from "../api.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";

const SYSTEM_TABS = [
  { id: "all", name: "Все" },
  { id: "personal", name: "Личные" },
  { id: "groups", name: "Группы" },
  { id: "channels", name: "Каналы" },
];

let tab = "all";
let query = "";
let results = null;
let settingsCache = null;
const lastMessageIds = new Map();

export function ChatListPane() {
  const container = el("div", { class: "chat-list-pane" });
  renderInto(container);

  const unsubState = subscribe(() => renderInto(container));
  window.addEventListener("app:navigate", () => renderInto(container));

  api.getSettings().then((r) => (settingsCache = r.settings));

  async function refetch() {
    const [chatsRes, foldersRes] = await Promise.all([api.listChats(), api.listFolders()]);
    notifyNewMessages(chatsRes.chats);
    setState({ chats: chatsRes.chats, folders: foldersRes.folders });
  }

  function notifyNewMessages(nextChats) {
    const me = getState().user;
    for (const chat of nextChats) {
      const last = chat.lastMessage;
      const seen = lastMessageIds.get(chat.id);
      if (last) lastMessageIds.set(chat.id, last.id);
      if (!last || last.id === seen || last.senderId === me.id) continue;
    }
  }

  refetch();
  const iv = setInterval(refetch, 4000);
  container._cleanup = () => {
    clearInterval(iv);
    unsubState();
  };

  return container;
}

function renderInto(container) {
  const { chats, folders, user } = getState();
  const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];

  clear(container);

  const searchBar = el("div", { class: "chat-search-bar" }, [
    el("div", { class: "chat-search-input-wrap" }, [
      el("span", { class: "chat-search-icon", html: iconSvg("Search", 16) }),
      el("input", {
        class: "chat-search-input",
        placeholder: "Поиск",
        value: query,
        oninput: (e) => {
          query = e.target.value;
          if (!query.trim()) {
            results = null;
            renderInto(container);
            return;
          }
          clearTimeout(container._searchDebounce);
          container._searchDebounce = setTimeout(async () => {
            const r = await api.search(query.trim());
            results = {
              chats: chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())),
              users: r.users,
              messages: r.messages,
            };
            renderInto(container);
          }, 150);
        },
      }),
    ]),
    el("button", {
      class: "chat-new-channel-btn",
      title: "Новый канал",
      html: iconSvg("Plus", 16),
      onclick: async () => {
        const title = window.prompt("Название канала:");
        if (!title?.trim()) return;
        const { chat } = await api.createChannel(title.trim());
        await api.listChats().then((r) => setState({ chats: r.chats }));
        navigate(`/chat/${chat.id}`);
      },
    }),
  ]);
  container.appendChild(searchBar);

  if (results) {
    const box = el("div", { class: "chat-list-scroll" });
    if (!results.chats.length && !results.users.length && !results.messages.length) {
      box.appendChild(el("p", { class: "empty-hint" }, "Ничего не найдено"));
    }
    if (results.chats.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Чаты"));
      for (const c of results.chats) {
        box.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat }));
      }
    }
    if (results.users.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Люди"));
      for (const u of results.users) {
        box.appendChild(
          el(
            "button",
            {
              class: "search-user-row",
              onclick: async () => {
                const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
                query = "";
                results = null;
                await api.listChats().then((r) => setState({ chats: r.chats }));
                navigate(`/chat/${chat.id}`);
              },
            },
            [el("span", { class: "search-user-name" }, u.name), el("span", { class: "search-user-username" }, `@${u.username}`)]
          )
        );
      }
    }
    if (results.messages.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Сообщения"));
      for (const m of results.messages) {
        box.appendChild(
          el("button", { class: "search-message-row", onclick: () => navigate(`/chat/${m.chatId}`) }, m.text)
        );
      }
    }
    container.appendChild(box);
    return;
  }

  const tabs = [...SYSTEM_TABS, ...folders.map((f) => ({ id: f.id, name: f.name }))];
  const tabsRow = el(
    "div",
    { class: "chat-tabs-row" },
    tabs.map((t) =>
      el(
        "button",
        {
          class: `chat-tab ${tab === t.id ? "active" : ""}`,
          onclick: () => {
            tab = t.id;
            renderInto(container);
          },
        },
        t.name
      )
    )
  );
  container.appendChild(tabsRow);

  let list = chats.filter((c) => !c.archived);
  const folder = folders.find((f) => f.id === tab);
  if (folder) list = list.filter((c) => folder.chatIds.includes(c.id));
  else if (tab === "personal") list = list.filter((c) => c.type === "dm" || c.type === "secret" || c.type === "bot");
  else if (tab === "groups") list = list.filter((c) => c.type === "group");
  else if (tab === "channels") list = list.filter((c) => c.type === "channel");

  list = [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt.localeCompare(at);
  });

  const scroll = el("div", { class: "chat-list-scroll" });
  if (!list.length) scroll.appendChild(el("p", { class: "empty-hint" }, "Чатов нет"));
  for (const c of list) {
    scroll.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat }));
  }
  container.appendChild(scroll);
}

async function patchChat(id, patch) {
  const { chats } = getState();
  setState({ chats: chats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  await api.patchChat(id, patch);
}
