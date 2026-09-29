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
import { ProfileStatusBadge } from "../components/profileStatusBadge.js";
import { api } from "../api.js";
import { openAd } from "../lib/adLink.js";
import { getState, setState, subscribe } from "../state.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";
import { noteMessageInChatList } from "../lib/chatListSync.js";
import { readCache, writeCache } from "../lib/localCache.js";
import { openSidebarMenu, openSavedMessages } from "../components/sidebarMenu.js";
import { sortChats } from "../lib/chatSort.js";

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
        icon: "Bookmark",
        label: "Избранное",
        onClick: () => openSavedMessages(),
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
let searchFilter = "all"; // фильтр результатов поиска: all|dms|groups|channels|users|bots|messages
let settingsCache = null;
const lastMessageIds = new Map();
// «Только непрочитанные» — фильтр поверх любой вкладки и папки, как кнопка
// фильтра в Telegram. Запоминается на этом устройстве: это привычка читать,
// а не настройка аккаунта.
const UNREAD_ONLY_KEY = "shalter.chatList.unreadOnly";
let unreadOnly = (() => {
  try {
    return localStorage.getItem(UNREAD_ONLY_KEY) === "1";
  } catch {
    return false;
  }
})();
// Лента историй — ссылка нужна, чтобы прятать её на время поиска: результатам
// нужна вся высота колонки, а кружки историй к ним отношения не имеют.
let storiesBarEl = null;
// Какая строка результатов поиска выбрана стрелками (-1 — никакая).
let kbIndex = -1;
// Идёт перетаскивание закреплённого чата: перерисовка в этот момент выдернула
// бы строку из-под курсора, поэтому она откладывается до отпускания.
let draggingId = null;
let renderDeferred = false;
// Колонка, в которую рисуется список, — для горячих клавиш (selectTabByIndex).
let listSlotRef = null;

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
  storiesBarEl = storiesBar;
  listSlotRef = listSlot;
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
  window.addEventListener("app:navigate", ({ detail }) => {
    // Архив в колонке живёт, пока человек ходит по перепискам (и на телефоне
    // возвращается к нему кнопкой «назад»); уход в настройки, контакты и прочие
    // вкладки его закрывает.
    const p = detail?.path ?? window.location.pathname;
    if (getState().sidebarArchive && p !== "/" && !p.startsWith("/chat/")) {
      setState({ sidebarArchive: false });
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
  // Чат переименовали, сменили ему фото или описание. Сервер рассылает это из
  // доброго десятка мест (server/routes/chats.js), но слушать было некому: имя
  // и аватар группы в списке оставались прежними до перезагрузки страницы — и у
  // того, кто менял, тоже.
  const unsubChatUpdated = onWsMessage("chat:updated", () => scheduleRefetch());
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
    unsubChatUpdated();
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
        type: "search",
        // Стрелки и Enter — по результатам, не отрывая рук от клавиатуры;
        // Escape очищает поиск и возвращает к списку (как в Telegram Desktop).
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
              // Сеть моргнула — оставляем прошлые результаты, следующая буква
              // спросит заново. Раньше ошибка улетала необработанной.
              return;
            }
            // The chat rows come from local state so they render with the same
            // unread counts and last-message previews as the normal list; the
            // rest is whatever the server matched.
            const matchedIds = new Set(r.chats.map((c) => c.id));
            results = {
              query: typed,
              chats: getState().chats.filter((c) => matchedIds.has(c.id)),
              channels: r.channels ?? [],
              users: r.users ?? [],
              bots: r.bots ?? [],
              messages: r.messages ?? [],
            };
            // A late response from a shorter query must not replace the results
            // for what's in the box now. Only the results below are redrawn —
            // the field the person is typing into stays exactly where it is.
            searchFilter = "all";
            kbIndex = -1;
            if (query.trim() === typed) renderResults(listSlot);
          }, 150);
        },
      })),
    ]),
  ]);
}

// Сброс поиска целиком — и состояния, и самого поля. Раньше при переходе к
// найденному человеку сбрасывалось только состояние: результаты пропадали, а
// набранный текст оставался в поле, будто поиск всё ещё идёт.
function clearSearch(listSlot) {
  query = "";
  results = null;
  searchFilter = "all";
  kbIndex = -1;
  clearTimeout(listSlot?._searchDebounce);
  if (searchInputEl) searchInputEl.value = "";
  if (listSlot) renderResults(listSlot);
}

// Everything below the search field. Split out so that typing only redraws the
// results — the field itself is never touched, which is what keeps the caret in
// it (see the comment on searchInputEl above).
function renderResults(container) {
  // Пока тянут закреплённый чат, список не трогаем — перерисуем по отпусканию.
  // Страховка: если строка-источник уже пропала из документа (dragend до
  // неё тогда не доходит), не замораживаем список навсегда.
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
  // Порядок важен: scrollTop снят выше, до того как блок опустеет, — у пустого
  // блока прокручивать нечего, и браузер сбрасывает её сам.
  clear(bodySlot);
  clear(scrollSlot);

  if (results) {
    const box = scrollSlot;
    // Разбор своих чатов по типу — чтобы фильтр умел показывать отдельно
    // личные, группы и каналы, а не валить всё в «Чаты».
    const dms = results.chats.filter((c) => c.type === "dm" || c.type === "bot");
    const groups = results.chats.filter((c) => c.type === "group");
    const joinedChannels = results.chats.filter((c) => c.type === "channel");
    const total = results.chats.length + results.channels.length + results.users.length + results.bots.length + results.messages.length;

    // Фильтр-вкладки: показываем только те, где что-то есть. «Каналы»
    // объединяют свои каналы и публичные, которые не подписаны.
    const buckets = [
      { id: "all", name: "Все", count: total },
      { id: "dms", name: "Личные", count: dms.length },
      { id: "groups", name: "Группы", count: groups.length },
      { id: "channels", name: "Каналы", count: joinedChannels.length + results.channels.length },
      { id: "users", name: "Люди", count: results.users.length },
      { id: "bots", name: "Боты", count: results.bots.length },
      { id: "messages", name: "Сообщения", count: results.messages.length },
    ].filter((b) => b.id === "all" || b.count > 0);
    // Активный фильтр опустел (сменился запрос) — вернуться на «Все».
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
    // Открыл найденный чат — поиск закрывается и поле очищается, как в
    // Telegram: дальше человек в переписке, а не в результатах.
    const openFound = (id) => {
      clearSearch(container);
      navigate(`/chat/${id}`);
    };
    const foundRow = (c) =>
      ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally, onOpen: openFound });
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
    // Public channels you haven't joined. Tapping opens the channel rather than
    // subscribing on the spot — joining something from a search result you
    // haven't read yet is not what a tap means.
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
            // Переход — сразу, как только известен чат. Раньше здесь ещё
            // дожидались полного списка чатов, и нажатие на найденного
            // человека «залипало» на всё это время; список догоняет сам.
            const btn = e.currentTarget;
            if (btn.dataset.busy) return;
            btn.dataset.busy = "1";
            try {
              const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
              clearSearch(container);
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

  // Архив прямо в колонке, как в Telegram Desktop. Вкладка «Архив» открывается
  // на весь экран (FULL_PAGE_ROUTES в app.js), и стоило открыть из неё чат,
  // как переписка занимала её место, а колонка слева показывала обычный список
  // — без архивных чатов. Вернуться к архиву, чтобы что-то в нём сделать, было
  // нельзя, пока не догадаешься снова нажать «Архив». Теперь чат из архива
  // открывается рядом с ним (views/archive.js поднимает sidebarArchive).
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
        ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally })
      );
    }
    bodySlot.appendChild(scrollSlot);
    scrollSlot.scrollTop = keepScroll;
    return;
  }

  const tabs = [...SYSTEM_TABS, ...folders.map((f) => ({ id: f.id, name: f.name }))];
  // Папку удалили (здесь или на другом устройстве), а она была выбрана —
  // возвращаемся на «Все», а не показываем пустоту с подписью несуществующей
  // папки.
  if (!tabs.some((t) => t.id === tab)) tab = "all";
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
  const unreadIn = (tabId) => inTab(tabId).filter(hasUnread).length;
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
          // Правая кнопка по вкладке — как в Telegram: прочитать всё разом и
          // перейти к настройке папок.
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
        // Хранилище закрыто — фильтр просто не переживёт перезагрузку.
      }
      renderInto(container);
    },
  });
  bodySlot.appendChild(el("div", { class: "chat-tabs-bar" }, [tabsRow, filterBtn]));
  tabsRow.scrollLeft = tabsScrollLeft;

  let list = sortChats(inTab(tab));
  // Фильтр не прячет открытый сейчас чат: прочитал — и строка исчезла бы
  // прямо из-под курсора.
  if (unreadOnly) list = list.filter((c) => hasUnread(c) || c.id === currentId);

  const scroll = scrollSlot;
  // Первой строкой — и до проверки на пустоту: объявление показывается и тогда,
  // когда чатов ещё нет вовсе.
  if (sponsoredAd) scroll.appendChild(SponsoredRow(sponsoredAd));
  // Строка «Архив» над чатами — как в Telegram. Без неё убранный в архив чат
  // просто исчезал из списка, и найти его можно было только через меню ☰.
  const archived = chats.filter((c) => c.archived);
  const showArchiveRow = tab === "all" && archived.length && !unreadOnly;
  if (showArchiveRow) scroll.appendChild(ArchiveRow(archived));
  // Пустая вкладка объясняет, почему она пустая. «Чатов нет» на вкладке
  // «Каналы» читается как «в приложении нет чатов» — хотя в соседней вкладке
  // их два десятка. Под строкой «Архив» «чатов нет» — неправда: они есть, просто
  // убраны, и строка сама на них указывает.
  if (!list.length && !showArchiveRow) {
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
  for (const c of list) {
    const row = ChatListItem({ chat: c, active: currentId === c.id, meId: user.id, onPatch: patchChat, onDelete: deleteChatItem, onLeave: leaveChatItem, onRead: markReadLocally });
    if (c.pinned) makePinnedDraggable(row, c.id, container);
    scroll.appendChild(row);
  }
  bodySlot.appendChild(scroll);
  scrollSlot.scrollTop = keepScroll;
}

function hasUnread(c) {
  return c.unreadCount > 0 || !!c.hasUnreadMention;
}

// Строка «Архив»: значок, подпись и имена архивных чатов через запятую, как в
// Telegram. Счётчик — серый: архив нарочно не зовёт так же громко, как
// обычные чаты.
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

// Меню вкладки: «Прочитать все» и переход к папкам. У папки — ещё и
// «Изменить», ведущее туда же.
function openTabMenu(pos, tabId, chatsInTab) {
  const unread = chatsInTab.filter(hasUnread);
  const isFolder = !SYSTEM_TABS.some((t) => t.id === tabId);
  openDropdownMenu(pos, [
    {
      icon: "CheckCheck",
      label: unread.length ? `Прочитать все (${unread.length})` : "Всё прочитано",
      onClick: async () => {
        if (!unread.length) return;
        // По очереди, а не разом: чатов может быть много, а сервер
        // ограничивает частоту запросов.
        for (const c of unread) {
          try {
            await api.markChatRead(c.id);
            markReadLocally(c.id);
          } catch {
            // Один не удался — остальные всё равно читаем.
          }
        }
      },
    },
    { separator: true },
    { icon: "Folder", label: isFolder ? "Изменить папку" : "Настроить папки", onClick: () => navigate("/settings/folders") },
  ]);
}

// Перетаскивание закреплённых чатов мышью — порядок, как в Telegram Desktop.
// Строка едет только среди закреплённых: бросить её на обычный чат нельзя,
// так закреп не снимается случайно.
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
  // Порядок считается по всем закреплённым, а не только по видимым на этой
  // вкладке: закреп один на весь список, и папка не должна его перемешивать.
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

// Найденное сообщение — строкой, как в Telegram: аватар и название чата, где
// оно лежит, время, кто написал и сам текст с подсвеченным совпадением.
// Раньше была только голая строка текста — по ней не понять, из какой она
// переписки, и десять одинаковых «ок» от разных людей не различить.
function SearchMessageRow(m, chats, me, q) {
  const chat = chats.find((c) => c.id === m.chatId);
  const title = chat ? (chat.type === "dm" ? (chat.otherUser?.name ?? chat.title) : chat.title) : "Чат";
  // [ce:N] — токен кастомного эмодзи; в плоском тексте поиска рисовать нечем,
  // показываем 🎨 вместо сырого «[ce:0]».
  const text = (m.text ?? "").replace(/\[ce:\d+\]/g, "🎨").replace(/\s+/g, " ");
  const who = m.senderId === me.id ? "Вы: " : "";
  // ?msg= — переписка откроется на самом найденном сообщении (views/chatView.js).
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
      // Текст — отдельным элементом, а не голым текстовым узлом: обрезать по
      // ширине можно только настоящий элемент, а найденное сообщение бывает
      // длиной в экран.
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

// Совпадение — <mark>, а длинный текст подрезается спереди, чтобы найденное
// слово не уехало за край строки: в сообщении на абзац оно часто в середине.
function highlightMatch(text, q) {
  const needle = (q ?? "").trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return [text];
  const start = at > 24 ? at - 16 : 0;
  const head = (start ? "…" : "") + text.slice(start, at);
  return [head, el("mark", { class: "search-hit" }, text.slice(at, at + needle.length)), text.slice(at + needle.length)];
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

// Оформленный пустой экран вместо голой строки: мягкий кружок со значком,
// заголовок и поясняющий текст (тот же emptyTextFor).
function chatListEmpty(tabId, folders) {
  return el("div", { class: "chat-empty" }, [
    el("div", { class: "chat-empty-icon", html: iconSvg("Send", 38) }),
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

// «Отметить как прочитанное»: сервер уже отметил, счётчик гасим сразу, не
// дожидаясь следующего обновления списка.
function markReadLocally(id) {
  const { chats } = getState();
  setState({ chats: chats.map((c) => (c.id === id ? { ...c, unreadCount: 0, hasUnreadMention: false } : c)) });
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

// ── Для горячих клавиш (lib/keyboardShortcuts.js) ──────────────────────────

// Чаты ровно в том порядке, в каком они сейчас на экране: с учётом вкладки,
// папки, архива в колонке и фильтра непрочитанных. Alt+↑/↓ раньше ходил по
// собственной копии «всех чатов» и из папки уводил в чат, которого в ней нет.
export function getVisibleChatIds() {
  return [...scrollSlot.querySelectorAll(".chat-list-item-wrap[data-chat-id]")].map((n) => n.dataset.chatId);
}

// Ctrl+1…9 — вкладка по номеру (системные, потом папки), как в Telegram Desktop.
export function selectTabByIndex(index) {
  const tabs = [...SYSTEM_TABS, ...(getState().folders ?? [])];
  const t = tabs[index];
  if (!t || !listSlotRef) return false;
  if (getState().sidebarArchive) setState({ sidebarArchive: false });
  clearSearch(null);
  tab = t.id;
  renderInto(listSlotRef);
  // Папка с дальнего конца ряда могла быть за краем — показываем, куда ушли.
  tabsRowEl?.querySelector(".chat-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}
