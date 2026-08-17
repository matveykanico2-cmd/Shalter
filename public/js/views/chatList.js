import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { ChatListItem } from "../components/chatListItem.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { openMemberPickerDialog } from "../components/memberPickerDialog.js";
import { openCreateChatDialog } from "../components/createChatDialog.js";
import { openInviteLinkDialog } from "../components/inviteLinkDialog.js";
import { openContactPickerDialog } from "../components/contactPickerDialog.js";
import { openCreateBotDialog } from "../components/createBotDialog.js";
import { openBotTokenDialog } from "../components/botTokenDialog.js";
import { StoriesBar } from "../components/storiesBar.js";
import { Avatar } from "../components/avatar.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { api } from "../api.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";
import { noteMessageInChatList } from "../lib/chatListSync.js";

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
        // Telegram's own "Избранное" — a chat with yourself, for notes, links
        // and files you want to keep. The server already supported it (a DM
        // whose two members are the same person, see data/chats.js's setMembers
        // dedup); nothing in the UI ever opened one.
        icon: "Archive",
        label: "Избранное",
        onClick: async () => {
          const me = getState().user;
          const { chat } = await api.startDm(me.id, "Избранное", me.avatarColor);
          await api.listChats().then((r) => setState({ chats: r.chats }));
          navigate(`/chat/${chat.id}`);
        },
      },
      {
        icon: "Users",
        label: "Новая группа",
        onClick: () => {
          openCreateChatDialog("group", (title, avatarImage, extra) => {
            openMemberPickerDialog(
              async ({ userIds, adminIds }) => {
                const { chat } = await api.createGroup(title, userIds, avatarImage, adminIds, extra);
                await api.listChats().then((r) => setState({ chats: r.chats }));
                navigate(`/chat/${chat.id}`);
                // A private chat is born with no way in — hand over the invite
                // link immediately, the way Telegram does, instead of leaving it
                // two screens deep in settings.
                if (!extra?.isPublic) openInviteLinkDialog(chat);
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
          openCreateChatDialog("channel", (title, avatarImage, extra) => {
            openMemberPickerDialog(
              async ({ userIds, adminIds }) => {
                const { chat } = await api.createChannel(title, avatarImage, userIds, adminIds, extra);
                await api.listChats().then((r) => setState({ chats: r.chats }));
                navigate(`/chat/${chat.id}`);
                // A private chat is born with no way in — hand over the invite
                // link immediately, the way Telegram does, instead of leaving it
                // two screens deep in settings.
                if (!extra?.isPublic) openInviteLinkDialog(chat);
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
      {
        icon: "Search",
        label: "Публичные каналы",
        onClick: () => navigate("/discover-channels"),
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

  // Обновление списка: не чаще, чем нужно, и без гонок.
  //
  // Раньше каждое событие по WebSocket дёргало refetch() напрямую. В оживлённом
  // чате это давало лавину параллельных запросов, и применялся тот ответ, что
  // пришёл последним, — а приходил он не обязательно самым свежим. Отсюда и
  // «чаты иногда пропадают»: список на мгновение заменялся более старым
  // снимком, где нового чата ещё нет.
  //
  // Три правила разом: запросы склеиваются в один (пачка сообщений — одно
  // обновление), одновременно выполняется не больше одного, и ответ старее
  // текущего просто выбрасывается.
  let refetchTimer = null;
  let inFlight = false;
  let pending = false;
  let latestSeq = 0;

  async function refetch() {
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    const seq = ++latestSeq;
    try {
      // Гонка с таймаутом — не ради скорости, а чтобы «не больше одного
      // запроса разом» не превратилось в «ни одного никогда». fetch сам по
      // себе может висеть неограниченно долго (сервер принял соединение и
      // замолчал), а пока висит он, inFlight остаётся поднятым: и сокет, и
      // пятнадцатисекундный опрос упираются в него и молча уходят ни с чем.
      // Список чатов в таком случае замирает на том, что успел показать, до
      // перезагрузки страницы. Лучше признать попытку неудачной и повторить.
      const [chatsRes, foldersRes] = await withTimeout(Promise.all([api.listChats(), api.listFolders()]));
      // Пока ответ ехал, успел уйти и вернуться более новый — этот уже неверен.
      if (seq !== latestSeq) return;
      notifyNewMessages(chatsRes.chats);
      setState({ chats: chatsRes.chats, folders: foldersRes.folders });
    } catch {
      // Сеть моргнула или сервер ответил отказом — оставляем то, что уже
      // показано. Пустой список вместо чатов хуже, чем список на секунду
      // устаревший.
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        scheduleRefetch(0);
      }
    }
  }

  function scheduleRefetch(delay = 250) {
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(refetch, delay);
  }

  // Заметно больше любого нормального ответа (список чатов — это два запроса
  // к своей же базе) и заметно меньше интервала опроса, чтобы зависший запрос
  // не съедал следующие попытки.
  const REFETCH_TIMEOUT_MS = 10000;
  function withTimeout(promise) {
    let timer = null;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("chat list refetch timed out")), REFETCH_TIMEOUT_MS);
      }),
    ]);
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
  // Само превью при этом ставится на место сразу, из тела события: refetch
  // едет четверть секунды плюс сеть, а если он не удался вовсе (429 от
  // лимитера, моргнувшая сеть), строка чата иначе так и осталась бы со старым
  // текстом — при том что сообщение уже пришло и отрисовано в самом чате.
  const unsubNew = onWsMessage("message:new", (msg) => {
    noteMessageInChatList(msg.chatId, msg.message);
    scheduleRefetch();
  });
  const unsubUpdated = onWsMessage("message:updated", () => scheduleRefetch());
  const unsubDeleted = onWsMessage("message:deleted", () => scheduleRefetch());
  // Fires when an admin adds this user to an existing group/channel (see
  // POST /api/chats/:id/members's "add" role) — without this the new chat
  // would only appear once the 15s poll below happens to catch up.
  const unsubAdded = onWsMessage("chat:added", () => scheduleRefetch());
  // Someone with the rights deleted a group/channel for everyone — drop it from
  // the list now, and get out of it if that's the chat currently open, rather
  // than leaving people looking at a conversation that no longer exists.
  const unsubGone = onWsMessage("chat:deleted", ({ chatId }) => {
    setState({ chats: getState().chats.filter((c) => c.id !== chatId) });
    if (window.location.pathname === `/chat/${chatId}`) navigate("/");
  });
  const iv = setInterval(refetch, 15000);
  container._cleanup = () => {
    clearInterval(iv);
    clearTimeout(refetchTimer);
    unsubState();
    unsubNew();
    unsubUpdated();
    unsubDeleted();
    unsubAdded();
    unsubGone();
  };

  return container;
}

// Both are created once for the lifetime of the pane, not per render.
let searchInputEl = null;
const bodySlot = el("div", { class: "chat-list-body" });

function renderInto(container) {
  const { chats, folders, user } = getState();
  const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];

  clear(container);

  const searchBar = el("div", { class: "chat-search-bar" }, [
    el("div", { class: "chat-search-input-wrap" }, [
      el("span", { class: "chat-search-icon", html: iconSvg("Search", 16) }),
      // Built once and reused by every renderInto() below — never rebuilt from
      // `query`. This is the same bug the contacts search had: renderInto()
      // clears the whole column, so the debounced search that fires after the
      // first character replaced the focused <input> with a fresh one, and
      // typing died after one letter.
      (searchInputEl ??= el("input", {
        class: "chat-search-input",
        placeholder: "Поиск: чаты, люди, боты, каналы",
        oninput: (e) => {
          query = e.target.value;
          if (!query.trim()) {
            results = null;
            renderResults(container);
            return;
          }
          clearTimeout(container._searchDebounce);
          container._searchDebounce = setTimeout(async () => {
            const typed = query.trim();
            const r = await api.search(typed);
            // The chat rows come from local state so they render with the same
            // unread counts and last-message previews as the normal list; the
            // rest is whatever the server matched.
            const matchedIds = new Set(r.chats.map((c) => c.id));
            results = {
              chats: chats.filter((c) => matchedIds.has(c.id)),
              channels: r.channels ?? [],
              users: r.users ?? [],
              bots: r.bots ?? [],
              messages: r.messages ?? [],
            };
            // A late response from a shorter query must not replace the results
            // for what's in the box now.
            // Only the results below are redrawn — the field the person is
            // typing into stays exactly where it is.
            if (query.trim() === typed) renderResults(container);
          }, 150);
        },
      })),
    ]),
    el("button", {
      class: "chat-new-channel-btn",
      title: "Новый чат",
      html: iconSvg("Plus", 16),
      onclick: (e) => openNewChatMenu(e),
    }),
  ]);
  searchInputEl.value = query;
  container.appendChild(searchBar);
  container.appendChild(bodySlot);
  renderResults(container);
}

// Everything below the search field. Split out so that typing only redraws the
// results — the field itself is never touched, which is what keeps the caret in
// it (see the comment on searchInputEl above).
function renderResults(container) {
  const { chats, folders, user } = getState();
  const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
  clear(bodySlot);


  if (results) {
    const box = el("div", { class: "chat-list-scroll" });
    const total = results.chats.length + results.channels.length + results.users.length + results.bots.length + results.messages.length;
    if (!total) {
      box.appendChild(el("p", { class: "empty-hint" }, "Ничего не найдено"));
    }
    if (results.chats.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Чаты"));
      for (const c of results.chats) {
        box.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem, onLeave: leaveChatItem }));
      }
    }
    // Public channels you haven't joined. Tapping opens the channel rather than
    // subscribing on the spot — joining something from a search result you
    // haven't read yet is not what a tap means.
    if (results.channels.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Каналы"));
      for (const c of results.channels) {
        box.appendChild(
          el("button", { class: "search-user-row", onclick: () => navigate(`/discover-channels?q=${encodeURIComponent(c.username || c.title)}`) }, [
            Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 30 }),
            el("span", { class: "search-user-name" }, c.title),
            VerifiedBadge(c, 13),
            el("span", { class: "search-user-username" }, c.username ? `@${c.username}` : `${c.subscriberCount} подписчиков`),
          ])
        );
      }
    }

    const accountRow = (u) =>
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
        [
          Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 30 }),
          el("span", { class: "search-user-name" }, u.name),
          VerifiedBadge(u, 13),
          u.username ? el("span", { class: "search-user-username" }, `@${u.username}`) : null,
        ].filter(Boolean)
      );

    if (results.users.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Люди"));
      for (const u of results.users) box.appendChild(accountRow(u));
    }
    if (results.bots.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Боты"));
      for (const u of results.bots) box.appendChild(accountRow(u));
    }
    if (results.messages.length) {
      box.appendChild(el("p", { class: "list-section-label" }, "Сообщения"));
      for (const m of results.messages) {
        box.appendChild(
          el("button", { class: "search-message-row", onclick: () => navigate(`/chat/${m.chatId}`) }, m.text)
        );
      }
    }
    bodySlot.appendChild(box);
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
  bodySlot.appendChild(tabsRow);

  let list = chats.filter((c) => !c.archived);
  const folder = folders.find((f) => f.id === tab);
  if (folder) list = list.filter((c) => folder.chatIds.includes(c.id));
  else if (tab === "personal") list = list.filter((c) => c.type === "dm" || c.type === "bot");
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
    scroll.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem, onLeave: leaveChatItem }));
  }
  bodySlot.appendChild(scroll);
}

async function patchChat(id, patch) {
  const { chats } = getState();
  setState({ chats: chats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  await api.patchChat(id, patch);
}

async function leaveChatItem(id) {
  const { chats } = getState();
  setState({ chats: chats.filter((c) => c.id !== id) });
  if (window.location.pathname === `/chat/${id}`) navigate("/");
  try {
    await api.leaveChat(id);
  } catch (err) {
    alert(err.message || "Не удалось выйти из чата");
    await api.listChats().then((r) => setState({ chats: r.chats }));
  }
}

async function deleteChatItem(id, forEveryone) {
  const { chats } = getState();
  setState({ chats: chats.filter((c) => c.id !== id) });
  if (window.location.pathname === `/chat/${id}`) navigate("/");
  try {
    if (forEveryone) await api.deleteChat(id);
    else await api.deleteChatForMe(id);
  } catch (err) {
    // Put it back rather than leaving the list lying about what happened — the
    // row was removed optimistically before the request went out.
    alert(err.message || "Не удалось удалить чат");
    await api.listChats().then((r) => setState({ chats: r.chats }));
  }
}
