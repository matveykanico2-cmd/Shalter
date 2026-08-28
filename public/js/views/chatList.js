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
import { openAd } from "../lib/adLink.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";
import { noteMessageInChatList } from "../lib/chatListSync.js";
import { readCache, writeCache } from "../lib/localCache.js";
import { openSidebarMenu } from "../components/sidebarMenu.js";

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
  // Список из прошлого захода — до того, как сеть ответит. На быстрой связи
  // разницы не видно, на медленной это разница между готовым приложением и
  // пустым столбцом на несколько секунд. Свежий список приходит следом и
  // заменяет показанное.
  if (!getState().chats?.length) {
    const cached = readCache("chats", getState().user?.id);
    if (cached?.chats?.length) setState({ chats: cached.chats, folders: cached.folders ?? getState().folders ?? [] });
  }
  // Mounted once, outside renderInto's clear-and-rebuild cycle — renderInto
  // runs on every poll/WS event, and re-creating the stories bar that often
  // would re-fetch stories constantly and drop any in-progress UI state in it.
  const listSlot = el("div", { class: "chat-list-inner" });
  // Порядок как в Telegram: поиск наверху, истории под ним, дальше сам список.
  // Истории монтируются один раз, вне цикла renderInto: он перерисовывается на
  // каждое событие сокета, и пересборка ленты историй так часто означала бы
  // постоянные запросы за ними и потерю всего, что в ней успели открыть.
  const storiesBar = StoriesBar();
  container.append(SidebarHeader(listSlot), storiesBar, listSlot);
  renderInto(listSlot);
  // Круглая кнопка «написать» в нижнем правом углу панели, поверх списка. В
  // шапке на её месте раньше стоял маленький «+», который делил строку с полем
  // поиска и от этого был тесным на телефоне.
  container.appendChild(
    el("button", {
      class: "sidebar-fab",
      title: "Новый чат",
      html: iconSvg("Edit", 22),
      onclick: (e) => openNewChatMenu(e),
    })
  );

  const unsubState = subscribe(() => renderInto(listSlot));
  window.addEventListener("app:navigate", () => renderInto(listSlot));

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
      // Складываем показанное, чтобы следующий заход начинался с готового
      // списка, а не с пустоты в ожидании сети.
      writeCache("chats", getState().user?.id, { chats: chatsRes.chats, folders: foldersRes.folders });
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

  // Первый запрос нужен, только если общий ответ при входе (routes/bootstrap.js)
  // ещё не наполнил состояние — иначе это была бы вторая поездка за тем же
  // самым. Небольшая отсрочка на случай, когда он в пути.
  if (getState().chats?.length) scheduleRefetch(1500);
  else refetch();
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
    // Лента историй слушает сокет сама (появилась/удалилась чужая история) —
    // её подписки снимаются вместе с панелью.
    storiesBar.cleanup?.();
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
// Сам прокручиваемый блок — тоже один на всё время жизни колонки.
// Раньше он создавался заново в renderResults, а renderResults вызывается на
// каждое событие сокета: любое новое сообщение в любом чате возвращало
// пролистанный список к самому верху. Теперь перерисовывается только его
// содержимое, а прокрутка остаётся там, где её оставили.
const scrollSlot = el("div", { class: "chat-list-scroll" });
// Что было показано в прошлый раз: имя вкладки или "search". Прокрутку имеет
// смысл сохранять только внутри одного и того же списка — при переключении
// вкладки или входе в поиск она сбрасывается, как и должна.
let lastShown = null;
// Рекламная строка — первая в списке чатов, над всеми разговорами.
//
// Запрашивается ровно один раз за жизнь колонки: каждый ответ сервера
// засчитывается как показ и списывается с бюджета кампании, а список
// перерисовывается на каждое входящее сообщение — дёргать выдачу оттуда значило
// бы списывать деньги за прокрутку.
//
// Показ личный: объявление приезжает запросом самого читателя, нигде не
// сохраняется и в чужие списки не попадает.
let sponsoredAd = null;
// Последний отрисованный ряд фильтров — только чтобы забрать у него
// горизонтальную прокрутку перед тем, как заменить его новым.
let tabsRowEl = null;

function renderInto(container) {
  // Не отцеплять bodySlot от колонки без нужды: элемент, вынутый из документа,
  // теряет свою прокрутку (scrollTop обнуляется и обратной вставкой не
  // возвращается) — а renderResults ниже как раз её и сохраняет. Пока bodySlot
  // уже на месте, трогать нечего.
  if (bodySlot.parentNode !== container) {
    clear(container);
    container.appendChild(bodySlot);
  }
  renderResults(container);
}

// Шапка боковой панели: «☰» и поле поиска. Собирается один раз за жизнь
// колонки, а не на каждую перерисовку списка, — так набранное в поиске
// переживает и приход нового сообщения, и смену маршрута.
function SidebarHeader(listSlot) {
  return el("div", { class: "chat-search-bar" }, [
    // Гамбургер слева от поиска — вход во всё остальное приложение (контакты,
    // звонки, архив, аккаунты, настройки). До этого те же переходы стояли
    // рельсом иконок вдоль края окна и занимали отдельную колонку.
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
      // Built once and reused: renderInto() clears the column, so a field
      // rebuilt from `query` would be replaced mid-typing by the debounced
      // search and lose the caret after the first character.
      (searchInputEl ??= el("input", {
        class: "chat-search-input",
        placeholder: "Поиск: чаты, люди, боты, каналы",
        oninput: (e) => {
          query = e.target.value;
          if (!query.trim()) {
            results = null;
            renderResults(listSlot);
            return;
          }
          clearTimeout(listSlot._searchDebounce);
          listSlot._searchDebounce = setTimeout(async () => {
            const typed = query.trim();
            const r = await api.search(typed);
            // The chat rows come from local state so they render with the same
            // unread counts and last-message previews as the normal list; the
            // rest is whatever the server matched.
            const matchedIds = new Set(r.chats.map((c) => c.id));
            results = {
              chats: getState().chats.filter((c) => matchedIds.has(c.id)),
              channels: r.channels ?? [],
              users: r.users ?? [],
              bots: r.bots ?? [],
              messages: r.messages ?? [],
            };
            // A late response from a shorter query must not replace the results
            // for what's in the box now. Only the results below are redrawn —
            // the field the person is typing into stays exactly where it is.
            if (query.trim() === typed) renderResults(listSlot);
          }, 150);
        },
      })),
    ]),
  ]);
}

// Everything below the search field. Split out so that typing only redraws the
// results — the field itself is never touched, which is what keeps the caret in
// it (see the comment on searchInputEl above).
function renderResults(container) {
  const { chats, folders, user } = getState();
  const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
  const shown = results ? "search" : tab;
  const keepScroll = shown === lastShown ? scrollSlot.scrollTop : 0;
  lastShown = shown;
  // Порядок важен: scrollTop снят выше, до того как блок опустеет, — у пустого
  // блока прокручивать нечего, и браузер сбрасывает её сам.
  clear(bodySlot);
  clear(scrollSlot);

  if (results) {
    const box = scrollSlot;
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
          onclick: async (e) => {
            // Переход — сразу, как только известен чат. Раньше здесь ещё
            // дожидались полного списка чатов, и нажатие на найденного
            // человека «залипало» на всё это время; список догоняет сам.
            const btn = e.currentTarget;
            if (btn.dataset.busy) return;
            btn.dataset.busy = "1";
            try {
              const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
              query = "";
              results = null;
              navigate(`/chat/${chat.id}`);
              api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
            } catch (err) {
              // Молчащая кнопка — это и есть «ничего не открывается»: ошибку
              // проглатывал невыполненный промис, и на экране не менялось ничего.
              btn.dataset.busy = "";
              alert(err.message || "Не удалось открыть чат");
            }
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
          // Текст — отдельным элементом, а не голым текстовым узлом: обрезать
          // по ширине можно только настоящий элемент, а найденное сообщение
          // бывает длиной в экран.
          el("button", { class: "search-message-row", onclick: () => navigate(`/chat/${m.chatId}`) }, [
            el("span", { class: "search-message-text" }, m.text),
          ])
        );
      }
    }
    bodySlot.appendChild(box);
    scrollSlot.scrollTop = keepScroll;
    return;
  }

  const tabs = [...SYSTEM_TABS, ...folders.map((f) => ({ id: f.id, name: f.name }))];
  // Одно правило отбора на всё: и на сам список ниже, и на счётчики у вкладок.
  // Разойдись они — на вкладке горела бы цифра, а внутри было бы пусто.
  const notArchived = chats.filter((c) => !c.archived);
  const inTab = (tabId) => {
    const f = folders.find((x) => x.id === tabId);
    if (f) return notArchived.filter((c) => f.chatIds.includes(c.id));
    if (tabId === "personal") return notArchived.filter((c) => c.type === "dm" || c.type === "bot");
    if (tabId === "groups") return notArchived.filter((c) => c.type === "group");
    if (tabId === "channels") return notArchived.filter((c) => c.type === "channel");
    return notArchived;
  };
  // Считаем чаты с непрочитанным, а не сами сообщения: «3» на вкладке значит
  // «три разговора ждут ответа» — по этому числу решают, куда заглянуть, а
  // сумма сообщений во всех каналах сразу об этом ничего не говорит.
  const unreadIn = (tabId) => inTab(tabId).filter((c) => c.unreadCount > 0).length;
  // Ряд фильтров тоже пересобирается на каждое событие. С несколькими папками
  // он прокручивается по горизонтали, и без этого выбранная папка уезжала из
  // видимой части ряда, стоило прийти сообщению.
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
        },
        [
          t.name,
          unreadIn(t.id) ? el("span", { class: "chat-tab-count" }, String(unreadIn(t.id))) : null,
        ]
      )
    )
  ));
  bodySlot.appendChild(tabsRow);
  tabsRow.scrollLeft = tabsScrollLeft;

  let list = inTab(tab);

  list = [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt.localeCompare(at);
  });

  const scroll = scrollSlot;
  // Первой строкой — и до проверки на пустоту: объявление показывается и тогда,
  // когда чатов ещё нет вовсе.
  if (sponsoredAd) scroll.appendChild(SponsoredRow(sponsoredAd));
  // Пустая вкладка объясняет, почему она пустая. «Чатов нет» на вкладке
  // «Каналы» читается как «в приложении нет чатов» — хотя в соседней вкладке
  // их два десятка.
  if (!list.length) scroll.appendChild(el("p", { class: "empty-hint" }, emptyTextFor(tab, folders)));
  for (const c of list) {
    scroll.appendChild(ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem, onLeave: leaveChatItem }));
  }
  bodySlot.appendChild(scroll);
  scrollSlot.scrollTop = keepScroll;
}

// Объявление строкой списка — но так, чтобы его нельзя было принять за чат:
// подпись «РЕКЛАМА» на месте времени, своя подложка и значок вместо аватара.
// Оно не участвует ни в сортировке, ни в фильтрах: реклама не поднимается
// «наверх» по свежести и не выдаёт себя за новое сообщение — она просто всегда
// первая и всегда подписана.
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

function emptyTextFor(tabId, folders) {
  const folder = folders.find((f) => f.id === tabId);
  if (folder) return `В папке «${folder.name}» пока нет чатов`;
  if (tabId === "personal") return "Личных переписок пока нет";
  if (tabId === "groups") return "Вы пока не состоите ни в одной группе";
  if (tabId === "channels") return "Вы пока не подписаны ни на один канал";
  return "Чатов нет — начните новый кнопкой в правом нижнем углу";
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
