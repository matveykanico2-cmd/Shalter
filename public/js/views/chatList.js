import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { ChatListItem } from "../components/chatListItem.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { openMemberPickerDialog } from "../components/memberPickerDialog.js";
import { openCreateChatDialog } from "../components/createChatDialog.js";
import { openContactPickerDialog } from "../components/contactPickerDialog.js";
import { openCreateBotDialog } from "../components/createBotDialog.js";
import { openBotTokenDialog } from "../components/botTokenDialog.js";
import { StoriesBar } from "../components/storiesBar.js";
import { api } from "../api.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";

async function openNewChatMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  openDropdownMenu(
    { x: rect.left, y: rect.bottom + 4 },
    [
      {
        icon: "Accounts",
        label: "Новый чат",
        onClick: () => {
          openContactPickerDialog(async (user) => {
            const { chat } = await api.startDm(user.id, user.name, user.avatarColor);
            await api.listChats().then((r) => setState({ chats: r.chats }));
            navigate(`/chat/${chat.id}`);
          }, "Новый чат");
        },
      },
      {
        icon: "Users",
        label: "Новая группа",
        onClick: () => {
          openCreateChatDialog("group", (title, avatarImage) => {
            openMemberPickerDialog(
              async ({ userIds, adminIds }) => {
                const { chat } = await api.createGroup(title, userIds, avatarImage, adminIds);
                await api.listChats().then((r) => setState({ chats: r.chats }));
                navigate(`/chat/${chat.id}`);
              },
              { title: "Участники группы", submitLabel: "Создать группу", allowRoles: true }
            );
          });
        },
      },
      {
        icon: "Send",
        label: "Новый канал",
        onClick: () => {
          openCreateChatDialog("channel", (title, avatarImage) => {
            openMemberPickerDialog(
              async ({ userIds, adminIds }) => {
                const { chat } = await api.createChannel(title, avatarImage, userIds, adminIds);
                await api.listChats().then((r) => setState({ chats: r.chats }));
                navigate(`/chat/${chat.id}`);
              },
              { title: "Подписчики канала (необязательно)", submitLabel: "Создать канал", allowRoles: true }
            );
          });
        },
      },
      {
        icon: "Code",
        label: "Новый бот",
        onClick: () => {
          openCreateBotDialog(async (name, avatarImage, description) => {
            const { bot, token } = await api.createBot(name, avatarImage, description);
            openBotTokenDialog(bot.user.name, token);
            const { chat } = await api.startDm(bot.user.id, bot.user.name, bot.user.avatarColor);
            await api.listChats().then((r) => setState({ chats: r.chats }));
            navigate(`/chat/${chat.id}`);
          });
        },
      },
    ]
  );
}

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
  // Mounted once, outside renderInto's clear-and-rebuild cycle — renderInto
  // runs on every poll/WS event, and re-creating the stories bar that often
  // would re-fetch stories constantly and drop any in-progress UI state in it.
  const listSlot = el("div", { class: "chat-list-inner" });
  container.append(StoriesBar(), listSlot);
  renderInto(listSlot);

  const unsubState = subscribe(() => renderInto(listSlot));
  window.addEventListener("app:navigate", () => renderInto(listSlot));

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
  // WS push (any message event, anywhere) triggers an immediate refetch so a
  // new message's preview/unread badge/ordering shows up without waiting on
  // the poll — that poll now only needs to run as a slow reconnect/catch-up
  // safety net, same as everywhere else this pattern is used.
  const unsubNew = onWsMessage("message:new", refetch);
  const unsubUpdated = onWsMessage("message:updated", refetch);
  const unsubDeleted = onWsMessage("message:deleted", refetch);
  // Fires when an admin adds this user to an existing group/channel (see
  // POST /api/chats/:id/members's "add" role) — without this the new chat
  // would only appear once the 15s poll below happens to catch up.
  const unsubAdded = onWsMessage("chat:added", refetch);
  const iv = setInterval(refetch, 15000);
  container._cleanup = () => {
    clearInterval(iv);
    unsubState();
    unsubNew();
    unsubUpdated();
    unsubDeleted();
    unsubAdded();
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
      title: "Новый чат",
      html: iconSvg("Plus", 16),
      onclick: (e) => openNewChatMenu(e),
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
        box.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem }));
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
    scroll.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem }));
  }
  container.appendChild(scroll);
}

async function patchChat(id, patch) {
  const { chats } = getState();
  setState({ chats: chats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  await api.patchChat(id, patch);
}

async function deleteChatItem(id, forEveryone) {
  const { chats } = getState();
  setState({ chats: chats.filter((c) => c.id !== id) });
  if (window.location.pathname === `/chat/${id}`) navigate("/");
  if (forEveryone) await api.deleteChat(id);
  else await api.deleteChatForMe(id);
}
