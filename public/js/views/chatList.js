import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { ChatListItem } from "../components/chatListItem.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { openMemberPickerDialog } from "../components/memberPickerDialog.js";

async function getUsersByIds(ids) {
  if (!ids.length) return [];
  const { contacts } = await api.listContacts().catch(() => ({ contacts: [] }));
  const byId = new Map(contacts.map((c) => [c.user?.id, c.user]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
import { openCreateChatDialog } from "../components/createChatDialog.js";
import { openInviteLinkDialog } from "../components/inviteLinkDialog.js";
import { openContactPickerDialog } from "../components/contactPickerDialog.js";
import { openCreateBotDialog } from "../components/createBotDialog.js";
import { openBotTokenDialog } from "../components/botTokenDialog.js";
import { StoriesBar } from "../components/storiesBar.js";
import { Avatar } from "../components/avatar.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { ProfileStatusBadge } from "../components/profileStatusBadge.js";
import { api } from "../api.js";
import { openAd } from "../lib/adLink.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";
import { isWsOpen, onWsMessage } from "../lib/wsClient.js";
import { noteMessageInChatList } from "../lib/chatListSync.js";
import { readCache, writeCache, dropCachedMessage } from "../lib/localCache.js";
import { openSidebarMenu, openSavedMessages } from "../components/sidebarMenu.js";
import { sortChats } from "../lib/chatSort.js";
import {
  CommunityRow,
  CommunityAvatar,
  CommunityChildBadge,
  communityActivity,
  communityDetails,
  forgetCommunityDetails,
  setCommunityDetails,
  memberChatsOf,
  plural,
  openEditCommunityDialog,
  openCreateCommunityDialog,
  openOwnChatPicker,
} from "../components/communityList.js";
import { askConfirm } from "../components/confirmDialog.js";

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
          }, "Новый чат", { exclude: [getState().user?.id] });
        },
      },
      {
        icon: "Bookmark",
        label: "Избранное",
        onClick: () => openSavedMessages(),
      },
      {
        icon: "Users",
        label: "Новая группа",
        onClick: () => {
          // Как в tweb: сначала участники, потом название и фото.
          openMemberPickerDialog(
            ({ userIds, adminIds }, pickerTab) => {
              pickerTab.keepOpen = true;
              getUsersByIds(userIds).then((members) =>
                openCreateChatDialog(
                  "group",
                  async (title, avatarImage, extra, tab) => {
                    const { chat } = await api.createGroup(title, userIds, avatarImage, adminIds, extra);
                    tab.close({ all: true });
                    await api.listChats().then((r) => setState({ chats: r.chats }));
                    navigate(`/chat/${chat.id}`);
                    if (!extra?.isPublic) openInviteLinkDialog(chat);
                  },
                  { members }
                )
              );
            },
            { title: "Добавить участников", submitLabel: "Далее", allowRoles: true }
          );
        },
      },
      {
        icon: "Send",
        label: "Новый канал",
        onClick: () => {
          // Как в tweb: название и описание, затем подписчики (можно пропустить).
          openCreateChatDialog("channel", (title, avatarImage, extra, infoTab) => {
            openMemberPickerDialog(
              async ({ userIds, adminIds }, pickerTab) => {
                pickerTab.keepOpen = true;
                pickerTab.setFabBusy(true);
                try {
                  const { chat } = await api.createChannel(title, avatarImage, userIds, adminIds, extra);
                  infoTab.close({ all: true });
                  await api.listChats().then((r) => setState({ chats: r.chats }));
                  navigate(`/chat/${chat.id}`);
                  if (!extra?.isPublic) openInviteLinkDialog(chat);
                } catch (err) {
                  pickerTab.setFabBusy(false);
                  alert(err?.message || "Не удалось создать канал");
                }
              },
              { title: "Добавить подписчиков", submitLabel: "Создать канал", allowRoles: true, fabIcon: "Check" }
            );
          });
        },
      },
      {
        icon: "Users",
        label: "Новое сообщество",
        onClick: () => {
          openCreateCommunityDialog({
            onCreated: async (community) => {
              const { openCommunityPanel } = await import("../components/communityList.js");
              await openCommunityPanel(community.id);
            },
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
let searchFilter = "all";
let settingsCache = null;
const lastMessageIds = new Map();
const UNREAD_ONLY_KEY = "shalter.chatList.unreadOnly";
let unreadOnly = (() => {
  try {
    return localStorage.getItem(UNREAD_ONLY_KEY) === "1";
  } catch {
    return false;
  }
})();
let storiesBarEl = null;
let kbIndex = -1;
let draggingId = null;
let renderDeferred = false;
let listSlotRef = null;

export function ChatListPane() {
  const container = el("div", { class: "chat-list-pane" });
  if (!getState().chats?.length) {
    const cached = readCache("chats", getState().user?.id);
    if (cached?.chats?.length) setState({ chats: cached.chats, folders: cached.folders ?? getState().folders ?? [] });
  }
  const listSlot = el("div", { class: "chat-list-inner" });
  const storiesBar = StoriesBar();
  storiesBarEl = storiesBar;
  listSlotRef = listSlot;
  container.append(SidebarHeader(listSlot), storiesBar, listSlot);
  renderInto(listSlot);
  container.appendChild(
    el("button", {
      class: "sidebar-fab",
      title: "Новый чат",
      html: iconSvg("Edit", 22),
      onclick: (e) => openNewChatMenu(e),
    })
  );

  // Перерисовываем список только когда поменялось то, что он показывает, и не чаще
  // раза за кадр: раньше любой setState (печатает, настройки, пачка WS-событий)
  // пересобирал весь список с аватарками — на iPhone это и тормозило.
  const LIST_KEYS = ["chats", "chatsLoaded", "folders", "user", "settings", "contactIds", "communities", "sidebarArchive", "sidebarCommunity"];
  let seenState = LIST_KEYS.map((k) => getState()[k]);
  let listFrame = 0;
  const unsubState = subscribe((st) => {
    const next = LIST_KEYS.map((k) => st[k]);
    if (next.every((v, i) => v === seenState[i])) return;
    seenState = next;
    if (listFrame) return;
    listFrame = requestAnimationFrame(() => {
      listFrame = 0;
      renderInto(listSlot);
    });
  });
  window.addEventListener("app:navigate", ({ detail }) => {
    const p = detail?.path ?? window.location.pathname;
    if ((getState().sidebarArchive || getState().sidebarCommunity) && p !== "/" && !p.startsWith("/chat/")) {
      setState({ sidebarArchive: false, sidebarCommunity: null });
    }
    renderInto(listSlot);
  });

  api.getSettings().then((r) => (settingsCache = r.settings));

  if (!sponsoredAd) {
    api
      .serveAd("chats")
      .then((r) => {
        if (!r.ad) return;
        sponsoredAd = r.ad;
        renderInto(listSlot);
      })
      .catch(() => {});
  }

  let refetchTimer = null;
  let inFlight = false;
  let pending = false;
  let latestSeq = 0;

  let lastListSig = "";
  let lastSetChats = null;
  async function refetch() {
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    const seq = ++latestSeq;
    try {
      const [chatsRes, foldersRes, commRes] = await withTimeout(
        Promise.all([api.listChats(), api.listFolders(), api.joinedCommunities().catch(() => null)])
      );
      if (seq !== latestSeq) return;
      // Ничего не поменялось — не трогаем состояние: иначе весь список с аватарками
      // перерисовывается и в localStorage синхронно пишется весь список (на iPhone — рывок).
      const sig = JSON.stringify([chatsRes.chats, foldersRes.folders, commRes?.communities ?? null]);
      // Пропускаем, только если и список локально с тех пор не менялся (отправка, удаление).
      if (sig === lastListSig && getState().chats === lastSetChats) return;
      lastListSig = sig;
      lastSetChats = chatsRes.chats;
      notifyNewMessages(chatsRes.chats);
      setState({ chats: chatsRes.chats, folders: foldersRes.folders, ...(commRes ? { communities: commRes.communities } : {}) });
      writeCache("chats", getState().user?.id, { chats: chatsRes.chats, folders: foldersRes.folders });
    } catch {
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

  if (getState().chats?.length) scheduleRefetch(1500);
  else refetch();
  const unsubNew = onWsMessage("message:new", (msg) => {
    noteMessageInChatList(msg.chatId, msg.message);
    scheduleRefetch();
  });
  const unsubUpdated = onWsMessage("message:updated", () => scheduleRefetch());
  const unsubDeleted = onWsMessage("message:deleted", (msg) => {
    const myId = getState().user?.id;
    if (myId && msg.chatId && msg.id) dropCachedMessage(msg.chatId, msg.id, myId);
    scheduleRefetch();
  });
  const unsubAdded = onWsMessage("chat:added", () => scheduleRefetch());
  const unsubChatUpdated = onWsMessage("chat:updated", () => scheduleRefetch());
  const unsubGone = onWsMessage("chat:deleted", ({ chatId }) => {
    setState({ chats: getState().chats.filter((c) => c.id !== chatId) });
    if (window.location.pathname === `/chat/${chatId}`) navigate("/");
  });
  // Свежие события приходят по WebSocket; опрос — только подстраховка: раз в 15 с, если
  // сокет отвалился, иначе раз в минуту, и никогда — пока вкладка/приложение в фоне.
  let lastPoll = Date.now();
  const iv = setInterval(() => {
    if (document.hidden) return;
    const every = isWsOpen() ? 60000 : 15000;
    if (Date.now() - lastPoll < every) return;
    lastPoll = Date.now();
    refetch();
  }, 5000);
  const onVisible = () => {
    if (document.hidden) return;
    lastPoll = Date.now();
    scheduleRefetch(0);
  };
  document.addEventListener("visibilitychange", onVisible);
  const unsubReconnected = onWsMessage("ws:reconnected", () => scheduleRefetch(0));
  container._cleanup = () => {
    clearInterval(iv);
    document.removeEventListener("visibilitychange", onVisible);
    unsubReconnected();
    cancelAnimationFrame(listFrame);
    clearTimeout(refetchTimer);
    storiesBar.cleanup?.();
    unsubState();
    unsubChatUpdated();
    unsubNew();
    unsubUpdated();
    unsubDeleted();
    unsubAdded();
    unsubGone();
  };

  return container;
}

let searchInputEl = null;
const bodySlot = el("div", { class: "chat-list-body" });
const scrollSlot = el("div", { class: "chat-list-scroll" });
let lastShown = null;
let sponsoredAd = null;
let tabsRowEl = null;

function renderInto(container) {
  if (bodySlot.parentNode !== container) {
    clear(container);
    container.appendChild(bodySlot);
  }
  renderResults(container);
}

function SidebarHeader(listSlot) {
  return el("div", { class: "chat-search-bar" }, [
    el("button", {
      class: "sidebar-menu-btn",
      title: "Меню",
      html: iconSvg("Menu", 20),
      onclick: (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        openSidebarMenu({ x: rect.left, y: rect.bottom + 6 });
      },
    }),
    el("div", { class: "chat-search-input-wrap" }, [
      el("span", { class: "chat-search-icon", html: iconSvg("Search", 16) }),
      (searchInputEl ??= el("input", {
        class: "chat-search-input",
        placeholder: "Поиск: чаты, люди, боты, каналы",
        type: "search",
        onkeydown: (e) => {
          if (e.key === "Escape") {
            if (!searchInputEl.value) return searchInputEl.blur();
            e.preventDefault();
            e.stopPropagation();
            clearSearch(listSlot);
            return;
          }
          if (!results) return;
          const rows = [...scrollSlot.querySelectorAll(".chat-list-item, .search-user-row, .search-message-row")];
          if (!rows.length) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            kbIndex = e.key === "ArrowDown" ? Math.min(rows.length - 1, kbIndex + 1) : Math.max(0, kbIndex - 1);
            rows.forEach((r, i) => r.classList.toggle("kb-selected", i === kbIndex));
            rows[kbIndex].scrollIntoView({ block: "nearest" });
          } else if (e.key === "Enter") {
            e.preventDefault();
            (rows[kbIndex] ?? rows[0]).click();
          }
        },
        oninput: (e) => {
          query = e.target.value;
          kbIndex = -1;
          if (!query.trim()) {
            results = null;
            searchFilter = "all";
            renderResults(listSlot);
            return;
          }
          clearTimeout(listSlot._searchDebounce);
          listSlot._searchDebounce = setTimeout(async () => {
            const typed = query.trim();
            let r;
            try {
              r = await api.search(typed);
            } catch {
              return;
            }
            const matchedIds = new Set(r.chats.map((c) => c.id));
            results = {
              query: typed,
              chats: getState().chats.filter((c) => matchedIds.has(c.id)),
              channels: r.channels ?? [],
              users: r.users ?? [],
              bots: r.bots ?? [],
              messages: r.messages ?? [],
            };
            searchFilter = "all";
            kbIndex = -1;
            if (query.trim() === typed) renderResults(listSlot);
          }, 150);
        },
      })),
    ]),
  ]);
}

function clearSearch(listSlot) {
  query = "";
  results = null;
  searchFilter = "all";
  kbIndex = -1;
  clearTimeout(listSlot?._searchDebounce);
  if (searchInputEl) searchInputEl.value = "";
  if (listSlot) renderResults(listSlot);
}

function renderResults(container) {
  if (draggingId && !scrollSlot.querySelector(".pinned-draggable.dragging")) draggingId = null;
  if (draggingId) {
    renderDeferred = true;
    return;
  }
  const { chats, folders, user } = getState();
  if (storiesBarEl) storiesBarEl.hidden = !!results;
  const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
  const shown = results ? "search" : getState().sidebarArchive ? "archive" : tab;
  const keepScroll = shown === lastShown ? scrollSlot.scrollTop : 0;
  lastShown = shown;
  clear(bodySlot);
  clear(scrollSlot);

  if (results) {
    const box = scrollSlot;
    const dms = results.chats.filter((c) => c.type === "dm" || c.type === "bot");
    const groups = results.chats.filter((c) => c.type === "group");
    const joinedChannels = results.chats.filter((c) => c.type === "channel");
    const total = results.chats.length + results.channels.length + results.users.length + results.bots.length + results.messages.length;

    const buckets = [
      { id: "all", name: "Все", count: total },
      { id: "dms", name: "Личные", count: dms.length },
      { id: "groups", name: "Группы", count: groups.length },
      { id: "channels", name: "Каналы", count: joinedChannels.length + results.channels.length },
      { id: "users", name: "Люди", count: results.users.length },
      { id: "bots", name: "Боты", count: results.bots.length },
      { id: "messages", name: "Сообщения", count: results.messages.length },
    ].filter((b) => b.id === "all" || b.count > 0);
    if (!buckets.some((b) => b.id === searchFilter)) searchFilter = "all";
    const show = (id) => searchFilter === "all" || searchFilter === id;
    if (total) {
      box.appendChild(
        el(
          "div",
          { class: "search-filter-bar" },
          buckets.map((b) =>
            el(
              "button",
              {
                class: `search-filter-chip${searchFilter === b.id ? " active" : ""}`,
                onclick: () => {
                  searchFilter = b.id;
                  renderResults(container);
                },
              },
              b.id === "all" ? b.name : `${b.name} ${b.count}`
            )
          )
        )
      );
    }

    if (!total) {
      box.appendChild(el("p", { class: "empty-hint" }, "Ничего не найдено"));
    }
    const openFound = (id) => {
      clearSearch(container);
      navigate(`/chat/${id}`);
    };
    const foundRow = (c) =>
      ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onMute: muteChatFor, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally, onOpen: openFound });
    if (dms.length && show("dms")) {
      box.appendChild(el("p", { class: "list-section-label" }, "Личные"));
      for (const c of dms) box.appendChild(foundRow(c));
    }
    if (groups.length && show("groups")) {
      box.appendChild(el("p", { class: "list-section-label" }, "Группы"));
      for (const c of groups) box.appendChild(foundRow(c));
    }
    if (joinedChannels.length && show("channels")) {
      box.appendChild(el("p", { class: "list-section-label" }, "Мои каналы"));
      for (const c of joinedChannels) box.appendChild(foundRow(c));
    }
    if (results.channels.length && show("channels")) {
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
          onclick: async (e) => {
            const btn = e.currentTarget;
            if (btn.dataset.busy) return;
            btn.dataset.busy = "1";
            try {
              const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
              clearSearch(container);
              navigate(`/chat/${chat.id}`);
              api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
            } catch (err) {
              btn.dataset.busy = "";
              alert(err.message || "Не удалось открыть чат");
            }
          },
        },
        [
          Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 30 }),
          el("span", { class: "search-user-name" }, u.name),
          VerifiedBadge(u, 13),
          ProfileStatusBadge(u, 13),
          u.username ? el("span", { class: "search-user-username" }, `@${u.username}`) : null,
        ].filter(Boolean)
      );

    if (results.users.length && show("users")) {
      box.appendChild(el("p", { class: "list-section-label" }, "Люди"));
      for (const u of results.users) box.appendChild(accountRow(u));
    }
    if (results.bots.length && show("bots")) {
      box.appendChild(el("p", { class: "list-section-label" }, "Боты"));
      for (const u of results.bots) box.appendChild(accountRow(u));
    }
    if (results.messages.length && show("messages")) {
      box.appendChild(el("p", { class: "list-section-label" }, "Сообщения"));
      for (const m of results.messages) box.appendChild(SearchMessageRow(m, chats, user, results.query));
    }
    bodySlot.appendChild(box);
    scrollSlot.scrollTop = keepScroll;
    return;
  }

  if (getState().sidebarCommunity) {
    const community = (getState().communities ?? []).find((c) => c.id === getState().sidebarCommunity);
    if (community) {
      renderCommunityPanel(container, community, currentId);
      scrollSlot.scrollTop = keepScroll;
      return;
    }
  }

  if (getState().sidebarArchive) {
    const archived = sortChats(chats.filter((c) => c.archived));
    bodySlot.appendChild(
      el("div", { class: "chat-list-archive-head" }, [
        el("button", {
          class: "icon-btn chat-list-archive-back",
          title: "Назад к чатам",
          html: iconSvg("ChevronLeft", 20),
          onclick: () => setState({ sidebarArchive: false }),
        }),
        el("span", { class: "chat-list-archive-title" }, "Архив"),
        el("span", { class: "chat-list-archive-count" }, archived.length ? String(archived.length) : ""),
      ])
    );
    if (!archived.length) scrollSlot.appendChild(el("p", { class: "empty-hint" }, "В архиве пусто"));
    for (const c of archived) {
      scrollSlot.appendChild(
        ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onMute: muteChatFor, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally })
      );
    }
    bodySlot.appendChild(scrollSlot);
    scrollSlot.scrollTop = keepScroll;
    return;
  }

  const tabs = [...SYSTEM_TABS, ...folders.map((f) => ({ id: f.id, name: f.name }))];
  if (!tabs.some((t) => t.id === tab)) tab = "all";
  const notArchived = chats.filter((c) => !c.archived);
  const inTab = (tabId) => {
    const f = folders.find((x) => x.id === tabId);
    if (f) return notArchived.filter((c) => f.chatIds.includes(c.id));
    if (tabId === "personal") return notArchived.filter((c) => c.type === "dm" || c.type === "bot");
    if (tabId === "groups") return notArchived.filter((c) => c.type === "group");
    if (tabId === "channels") return notArchived.filter((c) => c.type === "channel");
    return notArchived;
  };
  const unreadIn = (tabId) => inTab(tabId).filter(hasUnread).length;
  const tabsScrollLeft = tabsRowEl?.scrollLeft ?? 0;
  const tabsRow = (tabsRowEl = el(
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
          oncontextmenu: (e) => {
            e.preventDefault();
            openTabMenu({ x: e.clientX, y: e.clientY }, t.id, inTab(t.id));
          },
        },
        [
          t.name,
          unreadIn(t.id) ? el("span", { class: "chat-tab-count" }, String(unreadIn(t.id))) : null,
        ]
      )
    )
  ));
  const filterBtn = el("button", {
    class: `chat-unread-filter${unreadOnly ? " active" : ""}`,
    title: unreadOnly ? "Показать все чаты" : "Только непрочитанные",
    "aria-pressed": unreadOnly ? "true" : "false",
    html: iconSvg("Filter", 16),
    onclick: () => {
      unreadOnly = !unreadOnly;
      try {
        localStorage.setItem(UNREAD_ONLY_KEY, unreadOnly ? "1" : "0");
      } catch {
      }
      renderInto(container);
    },
  });
  bodySlot.appendChild(el("div", { class: "chat-tabs-bar" }, [tabsRow, filterBtn]));
  tabsRow.scrollLeft = tabsScrollLeft;

  let list = sortChats(inTab(tab));
  if (unreadOnly) list = list.filter((c) => hasUnread(c) || c.id === currentId);

  const scroll = scrollSlot;
  if (sponsoredAd) scroll.appendChild(SponsoredRow(sponsoredAd));
  const archived = chats.filter((c) => c.archived);
  const showArchiveRow = tab === "all" && archived.length && !unreadOnly;
  if (showArchiveRow) scroll.appendChild(ArchiveRow(archived));
  if (!list.length && !showArchiveRow && (unreadOnly || getState().chatsLoaded)) {
    scroll.appendChild(
      unreadOnly
        ? el("div", { class: "chat-empty" }, [
            el("div", { class: "chat-empty-icon", html: iconSvg("CheckCheck", 38) }),
            el("p", { class: "chat-empty-title" }, "Всё прочитано"),
            el("p", { class: "chat-empty-text" }, "Непрочитанных чатов здесь нет — фильтр можно выключить кнопкой справа от вкладок"),
          ])
        : chatListEmpty(tab, folders)
    );
  }
  // Сообщества (tweb): отдельная строка среди чатов, по времени самого свежего из своих чатов.
  const communities = ["all", "groups", "channels"].includes(tab) && !unreadOnly ? (getState().communities ?? []) : [];
  const communityQueue = communities
    .map((cm) => ({ cm, at: communityActivity(cm, notArchived) }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const flushCommunities = (beforeAt) => {
    while (communityQueue.length && (beforeAt === null || communityQueue[0].at >= beforeAt)) {
      scroll.appendChild(CommunityRow(communityQueue.shift().cm, notArchived));
    }
  };
  for (const c of list) {
    if (!c.pinned) flushCommunities(c.lastMessage?.createdAt ?? c.createdAt ?? "");
    const row = ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onMute: muteChatFor, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally });
    addCommunityBadge(row, c.id, communities);
    if (c.pinned) makePinnedDraggable(row, c.id, container);
    scroll.appendChild(row);
  }
  flushCommunities(null);
  bodySlot.appendChild(scroll);
  scrollSlot.scrollTop = keepScroll;
}

function addCommunityBadge(row, chatId, communities) {
  const community = communities.find((cm) => cm.chatIds.includes(chatId));
  const avatar = community && row.querySelector(".chat-list-item > .avatar");
  if (!avatar) return;
  avatar.classList.add("has-community-badge");
  avatar.appendChild(CommunityChildBadge(community));
}

async function reloadCommunities() {
  try {
    const { communities } = await api.joinedCommunities();
    setState({ communities });
  } catch {}
}

// Панель сообщества поверх списка чатов (tweb: forum tab / CommunityPeerDialogList).
function renderCommunityPanel(container, community, currentId) {
  const { chats, user } = getState();
  const rerender = () => renderResults(container);
  const info = communityDetails(community.id, rerender);
  const mine = sortChats(memberChatsOf(community, chats));
  const others = (info?.chats ?? []).filter((c) => !c.isMember);
  const isOwner = info?.isOwner ?? community.isOwner;
  const count = community.chatIds.length;
  const close = () => setState({ sidebarCommunity: null });
  const act = async (fn, fallback) => {
    try {
      const res = await fn();
      if (res?.community) setCommunityDetails(community.id, res.community);
      else forgetCommunityDetails(community.id);
      await reloadCommunities();
    } catch (err) {
      alert(err.message || fallback);
    }
  };

  bodySlot.appendChild(
    el("div", { class: "community-panel-head" }, [
      el("button", { class: "icon-btn community-panel-back", title: "Назад к чатам", html: iconSvg("ChevronLeft", 22), onclick: close }),
      CommunityAvatar(community, 40),
      el("div", { class: "community-panel-titles" }, [
        el("span", { class: "community-panel-title" }, community.title),
        el("span", { class: "community-panel-subtitle" }, `сообщество · ${count} ${plural(count, "чат", "чата", "чатов")}`),
      ]),
      el("button", {
        class: "icon-btn",
        title: "Ещё",
        html: iconSvg("MoreVertical", 20),
        onclick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const link = `${location.origin}/community/${community.id}`;
          openDropdownMenu({ x: r.right - 8, y: r.bottom + 2 }, [
            { icon: "Link", label: "Скопировать ссылку", onClick: () => navigator.clipboard?.writeText(link).catch(() => {}) },
            isOwner && {
              icon: "Edit",
              label: "Изменить сообщество",
              onClick: () => {
                openEditCommunityDialog(
                  { id: community.id, title: community.title, description: info?.description ?? community.description, avatarImage: info?.avatarImage ?? community.avatarImage },
                  (updated) => {
                    setCommunityDetails(community.id, { ...info, ...updated });
                    reloadCommunities();
                    rerender();
                  }
                );
              },
            },
            isOwner && {
              icon: "Trash",
              label: "Удалить сообщество",
              danger: true,
              onClick: async () => {
                if (!(await askConfirm(`Удалить сообщество «${community.title}»? Сами группы и каналы останутся.`))) return;
                try {
                  await api.deleteCommunity(community.id);
                  close();
                  await reloadCommunities();
                } catch (err) {
                  alert(err.message || "Не удалось удалить");
                }
              },
            },
          ].filter(Boolean));
        },
      }),
    ])
  );

  const box = scrollSlot;
  if (info?.description) box.appendChild(el("p", { class: "community-panel-description" }, info.description));
  if (isOwner) {
    box.appendChild(
      el("button", {
        class: "community-add-chat",
        onclick: () => {
          openOwnChatPicker((chatId) => act(() => api.addCommunityChat(community.id, chatId), "Не удалось добавить чат"), { exclude: community.chatIds });
        },
      }, [el("span", { class: "community-add-chat-icon", html: iconSvg("Plus", 22) }), el("span", {}, "Добавить чат в сообщество")])
    );
  }
  if (mine.length) {
    box.appendChild(el("p", { class: "list-section-label" }, "Ваши чаты"));
    for (const c of mine) {
      box.appendChild(
        ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onMute: muteChatFor, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally })
      );
    }
  }
  if (others.length) {
    box.appendChild(el("p", { class: "list-section-label" }, "Другие чаты сообщества"));
    for (const c of others) {
      const joinBtn = c.isPublic
        ? el("button", {
            class: "community-join-btn",
            onclick: async (e) => {
              e.stopPropagation();
              e.currentTarget.disabled = true;
              try {
                const res = await api.joinPublicChat(c.id);
                if (res.pending) alert("Заявка отправлена — администратор чата её рассмотрит");
                await api.listChats().then((r) => setState({ chats: r.chats }));
                forgetCommunityDetails(community.id);
                if (!res.pending) navigate(`/chat/${c.id}`);
              } catch (err) {
                alert(err.message || "Не удалось вступить");
              }
              rerender();
            },
          }, c.type === "channel" ? "Подписаться" : "Вступить")
        : el("span", { class: "community-invite-only" }, "по приглашению");
      box.appendChild(
        el("div", { class: "chat-list-item-wrap" }, [
          el("div", { class: "chat-list-item community-other-chat" }, [
            Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 54 }),
            el("div", { class: "chat-list-item-body" }, [
              el("div", { class: "chat-list-item-row" }, [el("span", { class: "chat-list-item-title" }, c.title)]),
              el("div", { class: "chat-list-item-row" }, [
                el("span", { class: "chat-list-item-preview" }, `${c.members} ${c.type === "channel" ? plural(c.members, "подписчик", "подписчика", "подписчиков") : plural(c.members, "участник", "участника", "участников")}`),
              ]),
            ]),
            joinBtn,
          ]),
        ])
      );
    }
  }
  if (!mine.length && !others.length) {
    box.appendChild(el("p", { class: "empty-hint" }, info ? (isOwner ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов") : "Загрузка…"));
  }
  bodySlot.appendChild(box);
}

function hasUnread(c) {
  return c.unreadCount > 0 || !!c.hasUnreadMention || !!c.unread;
}

function ArchiveRow(archived) {
  const sorted = sortChats(archived);
  const names = sorted.map((c) => (c.type === "dm" ? (c.otherUser?.name ?? c.title) : c.title)).filter(Boolean);
  const unread = sorted.filter(hasUnread).length;
  return el("div", { class: "chat-list-item-wrap" }, [
    el(
      "button",
      {
        class: "chat-list-item archive-row",
        onclick: () => setState({ sidebarArchive: true }),
      },
      [
        el("span", { class: "archive-row-icon", html: iconSvg("Archive", 24) }),
        el("div", { class: "chat-list-item-body" }, [
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-title" }, "Архив"),
          ]),
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-preview" }, names.join(", ")),
            unread ? el("span", { class: "chat-list-item-badges" }, [el("span", { class: "unread-badge muted" }, String(unread))]) : null,
          ]),
        ]),
      ]
    ),
  ]);
}

function openTabMenu(pos, tabId, chatsInTab) {
  const unread = chatsInTab.filter(hasUnread);
  const isFolder = !SYSTEM_TABS.some((t) => t.id === tabId);
  openDropdownMenu(pos, [
    {
      icon: "CheckCheck",
      label: unread.length ? `Прочитать все (${unread.length})` : "Всё прочитано",
      onClick: async () => {
        if (!unread.length) return;
        for (const c of unread) markReadLocally(c.id);
        await Promise.all(unread.map((c) => api.markChatRead(c.id).catch(() => {})));
      },
    },
    { separator: true },
    { icon: "Folder", label: isFolder ? "Изменить папку" : "Настроить папки", onClick: () => navigate("/settings/folders") },
  ]);
}

function makePinnedDraggable(row, chatId, container) {
  row.draggable = true;
  row.classList.add("pinned-draggable");
  row.addEventListener("dragstart", (e) => {
    draggingId = chatId;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chatId);
  });
  row.addEventListener("dragover", (e) => {
    if (!draggingId || draggingId === chatId) return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    row.classList.toggle("drop-before", !after);
    row.classList.toggle("drop-after", after);
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    const after = row.classList.contains("drop-after");
    row.classList.remove("drop-before", "drop-after");
    const moved = draggingId;
    if (!moved || moved === chatId) return;
    reorderPinned(moved, chatId, after);
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    draggingId = null;
    if (renderDeferred) {
      renderDeferred = false;
      renderResults(container);
    }
  });
}

async function reorderPinned(movedId, targetId, after) {
  const before = getState().chats;
  const ids = sortChats(before.filter((c) => c.pinned)).map((c) => c.id).filter((id) => id !== movedId);
  const at = ids.indexOf(targetId);
  if (at < 0) return;
  ids.splice(after ? at + 1 : at, 0, movedId);
  const order = new Map(ids.map((id, i) => [id, i]));
  draggingId = null;
  setState({ chats: before.map((c) => (order.has(c.id) ? { ...c, pinOrder: order.get(c.id) } : c)) });
  try {
    await api.setPinnedChatOrder(ids);
  } catch (err) {
    setState({ chats: before });
    alert(err.message || "Не удалось изменить порядок");
  }
}

function SearchMessageRow(m, chats, me, q) {
  const chat = chats.find((c) => c.id === m.chatId);
  const title = chat ? (chat.type === "dm" ? (chat.otherUser?.name ?? chat.title) : chat.title) : "Чат";
  const text = (m.text ?? "").replace(/\[ce:\d+\]/g, "🎨").replace(/\s+/g, " ");
  const who = m.senderId === me.id ? "Вы: " : "";
  return el("button", { class: "search-message-row", onclick: () => navigate(`/chat/${m.chatId}?msg=${encodeURIComponent(m.id)}`) }, [
    Avatar({
      size: 40,
      name: chat?.otherUser?.name ?? title,
      color: chat?.otherUser?.avatarColor ?? chat?.avatarColor,
      image: chat?.otherUser?.avatarImage ?? chat?.avatarImage,
    }),
    el("div", { class: "search-message-body" }, [
      el("div", { class: "chat-list-item-row" }, [
        el("span", { class: "chat-list-item-title" }, title),
        el("span", { class: "chat-list-item-time" }, searchTimeLabel(m.createdAt)),
      ]),
      el("span", { class: "search-message-text" }, [who, ...highlightMatch(text, q)]),
    ]),
  ]);
}

function searchTimeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function highlightMatch(text, q) {
  const needle = (q ?? "").trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return [text];
  const start = at > 24 ? at - 16 : 0;
  const head = (start ? "…" : "") + text.slice(start, at);
  return [head, el("mark", { class: "search-hit" }, text.slice(at, at + needle.length)), text.slice(at + needle.length)];
}

function SponsoredRow(ad) {
  return el("div", { class: "chat-list-item-wrap sponsored-wrap" }, [
    el(
      "button",
      {
        class: "chat-list-item sponsored-row",
        title: ad.url || "",
        onclick: () => openAd(ad),
      },
      [
        el("span", { class: "sponsored-mark", html: iconSvg("Zap", 22) }),
        el("div", { class: "chat-list-item-body" }, [
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-title" }, ad.title || "Реклама"),
            el("span", { class: "sponsored-badge" }, "РЕКЛАМА"),
          ]),
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-preview" }, ad.text || ""),
            ad.url ? el("span", { class: "sponsored-go" }, "Перейти →") : null,
          ]),
        ]),
      ]
    ),
  ]);
}

function chatListEmpty(tabId, folders) {
  return el("div", { class: "chat-empty" }, [
    el("div", { class: "chat-empty-icon chat-empty-logo" }, [el("img", { src: "/icons/icon.svg", alt: "", draggable: false })]),
    el("p", { class: "chat-empty-title" }, "Здесь пока пусто"),
    el("p", { class: "chat-empty-text" }, emptyTextFor(tabId, folders)),
  ]);
}

function emptyTextFor(tabId, folders) {
  const folder = folders.find((f) => f.id === tabId);
  if (folder) return `В папке «${folder.name}» пока нет чатов`;
  if (tabId === "personal") return "Личных переписок пока нет";
  if (tabId === "groups") return "Вы пока не состоите ни в одной группе";
  if (tabId === "channels") return "Вы пока не подписаны ни на один канал";
  return "Чатов нет — начните новый кнопкой в правом нижнем углу";
}

function markReadLocally(id) {
  const { chats } = getState();
  setState({ chats: chats.map((c) => (c.id === id ? { ...c, unreadCount: 0, hasUnreadMention: false, unread: undefined } : c)) });
}

// Сразу меняем список, запрос — в фоне; при ошибке возвращаем как было.
async function patchChat(id, patch) {
  const before = getState().chats.find((c) => c.id === id);
  setState({ chats: getState().chats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  try {
    await api.patchChat(id, patch);
  } catch (err) {
    if (before) setState({ chats: getState().chats.map((c) => (c.id === id ? before : c)) });
    alert(err.message || "Не удалось изменить чат");
  }
}

async function muteChatFor(id, opts) {
  const before = getState().chats.find((c) => c.id === id);
  const muted = !opts?.off;
  setState({ chats: getState().chats.map((c) => (c.id === id ? { ...c, muted, mutedUntil: muted ? c.mutedUntil : undefined } : c)) });
  try {
    const { chat: updated } = await api.muteChat(id, opts);
    setState({ chats: getState().chats.map((c) => (c.id === id ? { ...c, ...updated } : c)) });
  } catch (err) {
    if (before) setState({ chats: getState().chats.map((c) => (c.id === id ? before : c)) });
    alert(err.message || "Не удалось изменить уведомления");
  }
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
    alert(err.message || "Не удалось удалить чат");
    await api.listChats().then((r) => setState({ chats: r.chats }));
  }
}

export function getVisibleChatIds() {
  return [...scrollSlot.querySelectorAll(".chat-list-item-wrap[data-chat-id]")].map((n) => n.dataset.chatId);
}

export function selectTabByIndex(index) {
  const tabs = [...SYSTEM_TABS, ...(getState().folders ?? [])];
  const t = tabs[index];
  if (!t || !listSlotRef) return false;
  if (getState().sidebarArchive) setState({ sidebarArchive: false });
  clearSearch(null);
  tab = t.id;
  renderInto(listSlotRef);
  tabsRowEl?.querySelector(".chat-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}
