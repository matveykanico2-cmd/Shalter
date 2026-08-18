import { el, mount, clear } from "./lib/dom.js";
import { api } from "./api.js";
import { setState, getState } from "./state.js";
import { route, notFound, startRouter, navigate } from "./router.js";
import { NavRail } from "./components/navRail.js";
import { ChatListPane } from "./views/chatList.js";
import { mountIncomingCallWatcher, answerCall } from "./components/incomingCallWatcher.js";
import { openMiniApp } from "./components/miniApp.js";
import { startWsClient } from "./lib/wsClient.js";
import { ensurePushSubscribed } from "./lib/push.js";
import { subscribeCall, getCallState, minimize, restore } from "./lib/callController.js";
import { Avatar } from "./components/avatar.js";
import { iconSvg } from "./icons.js";
import { initUiTranslation } from "./lib/uiTranslate.js";
import { hasPasscode } from "./lib/passcodeLock.js";
import { showPasscodeLockScreen } from "./components/passcodeLockScreen.js";
import { initKeyboardShortcuts } from "./lib/keyboardShortcuts.js";
import { WaveBearMascot } from "./components/mascot.js";

const root = document.getElementById("view-root");

function withCleanup(mainSlot) {
  if (mainSlot._cleanup) {
    mainSlot._cleanup();
    mainSlot._cleanup = null;
  }
}

function formatElapsed(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

async function boot() {
  const path = window.location.pathname;

  if (path.startsWith("/login")) {
    const params = new URLSearchParams(window.location.search);
    const { LoginView } = await import("./views/login.js");
    LoginView(root, { addMode: params.get("add") === "1" });
    return;
  }

  // Where a scanned QR code lands — a standalone confirm screen, shown as-is
  // whether or not this browser/device already has a Shalter session (see
  // QrLoginConfirmView), so it deliberately sits outside the authenticated
  // app shell below.
  if (path === "/qr-login") {
    const { QrLoginConfirmView } = await import("./views/qrLoginConfirm.js");
    await QrLoginConfirmView(root);
    return;
  }

  const { user, accounts } = await api.session();
  if (!user || !user.name) {
    window.location.href = "/login";
    return;
  }
  // A local (this-device-only, see lib/passcodeLock.js) passcode lock, if
  // one's been set — blocks here, before anything from the actual app
  // renders, rather than showing the shell underneath and locking on top of
  // it. Re-armed below (see the visibilitychange listener) every time the
  // tab comes back from being hidden, same trigger Telegram's own Passcode
  // Lock uses.
  if (hasPasscode()) await showPasscodeLockScreen();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasPasscode()) showPasscodeLockScreen();
  });

  setState({ user, accounts });
  // Настройки, чаты, папки и контакты — одним ответом, который ушёл ещё из
  // index.html одновременно с запросом сессии. Без await: приложение рисуется
  // сразу, а пришедшее просто наполняет его.
  const bootData = api
    .bootstrap()
    .then((data) => {
      if (!data) return null;
      setState({ contactIds: data.contactIds, chats: data.chats, folders: data.folders });
      return data;
    })
    .catch(() => null);
  startWsClient();
  mountIncomingCallWatcher();
  initKeyboardShortcuts();
  // Starts observing before the shell below does its first render, so that
  // initial paint gets caught by the same pass as everything after it.
  bootData
    .then((data) => (data ? { settings: data.settings } : api.getSettings()))
    .then(({ settings }) => {
      setState({ settings });
      initUiTranslation(settings.uiLanguage);
      // Theme/accent/reduce-motion are also applied instantly when changed in
      // Settings or the account menu (see views/settings/index.js,
      // components/navRail.js) — restoring them here too is what makes a
      // manually-picked theme/accent survive a hard reload instead of
      // silently falling back to the OS default every time.
      if (settings.theme && settings.theme !== "system") document.documentElement.setAttribute("data-theme", settings.theme);
      if (settings.accent) document.documentElement.style.setProperty("--color-accent", settings.accent);
      document.documentElement.toggleAttribute("data-reduce-motion", !!settings.reduceMotion);
    })
    .catch(() => {});
  // Register the service worker unconditionally — it's what makes the app
  // installable as a PWA (manifest + icons alone aren't enough), independent
  // of whether the user has granted push permission. ensurePushSubscribed()
  // below also registers it, but only when permission is already "granted";
  // registration itself is idempotent, so doing it here too is harmless.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  // Re-subscribes silently if permission was already granted in an earlier
  // session (e.g. browser restart) — does nothing if it wasn't, so this is
  // safe to call unconditionally on every boot.
  ensurePushSubscribed().catch(() => {});
  // Код переписки приезжает заранее, пока человек смотрит на список чатов.
  //
  // Он вынесен в отдельный кусок (см. маршрут /chat/:id ниже) — и при первом
  // нажатии на чат браузер качал его прямо в этот момент, вместе с тем, что
  // тянет он сам: четыре обращения к серверу подряд, почти секунда ожидания.
  // Здесь мы просто просим его заранее, в свободное время: к нажатию он уже
  // на месте, и открытие сводится к одному запросу за сообщениями.
  const prefetchChat = () => import("./views/chatView.js").catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(prefetchChat, { timeout: 3000 });
  else setTimeout(prefetchChat, 1200);

  const shell = el("div", { class: "shell" });
  const listCol = el("div", { class: "shell-list-col" });
  const mainSlot = el("div", { class: "shell-main-col" });
  const callBubbleSlot = el("div", { class: "call-bubble-slot" });
  mount(root, shell);
  shell.append(listCol, mainSlot, callBubbleSlot);
  listCol.append(NavRail(), ChatListPane());

  function renderCallBubble() {
    clear(callBubbleSlot);
    const s = getCallState();
    if (!s || !s.minimized) return;
    const other = s.others[0];
    callBubbleSlot.appendChild(
      el(
        "button",
        { class: "call-pip-bubble", onclick: restore },
        [
          Avatar({ name: other?.name ?? s.chatTitle, color: other?.avatarColor ?? "#8A8F98", image: other?.avatarImage, size: 28 }),
          el("span", { class: "call-pip-title" }, s.chatTitle),
          el("span", { class: "call-pip-timer mono" }, s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed)),
        ]
      )
    );
  }
  subscribeCall(renderCallBubble);
  renderCallBubble();

  let prevPath = path;
  window.addEventListener("app:navigate", ({ detail }) => {
    // Any route other than the bare chat list renders into mainSlot — on
    // mobile widths mainSlot is only visible while "chat-open" is set (see
    // components.css), so every one of those routes needs it, not just
    // /chat/ and /call/. Without this, Contacts/Calls/Archive/Settings were
    // rendering into a display:none column and looked like dead nav buttons.
    const fullScreen = detail.path !== "/";
    shell.classList.toggle("chat-open", fullScreen);
    // Leaving the call screen without explicitly minimizing (nav-rail click,
    // browser back) still needs the call to keep running in the background —
    // implicitly minimize so the PiP bubble takes over.
    if (prevPath.startsWith("/call/") && !detail.path.startsWith("/call/")) {
      const s = getCallState();
      if (s && !s.minimized) minimize();
    }
    prevPath = detail.path;
  });
  shell.classList.toggle("chat-open", path !== "/");

  route("/", () => {
    withCleanup(mainSlot);
    mount(mainSlot, el("div", { class: "empty-chat" }, [
      WaveBearMascot(),
      el("p", { class: "empty-chat-title" }, "Выберите чат"),
      el("p", { class: "empty-hint" }, "Или начните новый — найдите человека во вкладке «Контакты»."),
    ]));
  });
  route("/chat/:id", async (params) => {
    withCleanup(mainSlot);
    // Сама переписка — тоже отдельным куском: на первом экране виден список
    // чатов, а вместе с перепиской приезжают поле ввода, диктофон, стикеры и
    // рисованные подарки. Это самая тяжёлая часть, и она не нужна, пока чат не
    // открыли.
    const { ChatView } = await import("./views/chatView.js");
    await ChatView(mainSlot, params.id);
  });
  route("/call/:id", async (params) => {
    withCleanup(mainSlot);
    // Пришли по кнопке «Ответить» из уведомления — звонок принимается сразу,
    // без второго нажатия уже внутри приложения (public/sw.js ставит ?answer=1).
    if (new URLSearchParams(window.location.search).get("answer") === "1") {
      window.history.replaceState(null, "", `/call/${params.id}`);
      await answerCall(params.id).catch(() => {});
    }
    const { CallScreenView } = await import("./views/callScreen.js");
    await CallScreenView(mainSlot, params.id);
  });
  // Where a Premium invite link (callScreen.js's "Пригласить по ссылке")
  // lands — joins the call server-side (server/routes/calls.js's
  // /join/:token), then hands off to the normal call screen the same as any
  // other call, just via a replace() so "back" doesn't return to this
  // one-shot redirect.
  route("/call-join/:token", async (params) => {
    withCleanup(mainSlot);
    try {
      const { call } = await api.joinCallByLink(params.token);
      navigate(`/call/${call.id}`, { replace: true });
    } catch (err) {
      mount(
        mainSlot,
        el("div", { class: "empty-chat" }, [
          el("p", { class: "empty-chat-title" }, "Ссылка недействительна"),
          el("p", { class: "empty-hint" }, err.message || "Звонок уже завершён, или ссылка устарела."),
        ])
      );
    }
  });
  // Where a scanned profile QR code / shared @username link lands (see
  // components/profileQrDialog.js) — resolves the account and starts a DM,
  // same one-shot resolve-then-redirect shape as /call-join/:token above.
  // Ссылка на @хендл: человек, бот, канал или группа — одним адресом.
  //
  // Что понимает: /@имя и /u/имя (второе оставлено — такие ссылки уже
  // разошлись в QR-кодах профилей), а для ботов ещё два параметра, знакомых
  // всем по Telegram:
  //   ?start=код  — открыть бота и сразу отправить ему «/start код», чтобы он
  //                 знал, откуда пришёл человек (реферальная ссылка, товар,
  //                 приглашение);
  //   ?app=1      — открыть сразу мини-приложение бота, минуя переписку.
  async function openByUsername(username, search) {
    const params = new URLSearchParams(search || "");
    const startPayload = params.get("start");
    const wantsApp = params.get("app") === "1" || params.has("startapp");

    try {
      const { user: found } = await api.findUserByUsername(username);
      const { chat } = await api.startDm(found.id, found.name, found.avatarColor);
      // Отправляем ДО перехода: свои же сообщения сервер обратно не
      // рассылает (их показывает эхо в поле ввода), поэтому отправленное
      // после открытия чата всплыло бы только через опрос, секунд через
      // пятнадцать — и человек увидел бы пустую переписку с ботом.
      if (found.isBot && startPayload) {
        // Именно сообщением, а не скрытым параметром: бот получает его обычным
        // способом, а человек видит в переписке, что было отправлено от его
        // имени. Пробел важен — «/start» без кода это другая команда.
        await api.sendMessage(chat.id, `/start ${startPayload}`.trim()).catch(() => {});
      }
      api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
      navigate(`/chat/${chat.id}`, { replace: true });
      if (found.isBot && wantsApp) openMiniApp({ botId: found.id, botName: found.name, chatId: chat.id });
      return;
    } catch {
      // Не человек и не бот — возможно, публичный канал или группа.
    }

    try {
      const { chat } = await api.findChatByUsername(username);
      // Уже подписан — открываем сам чат; нет — показываем карточку в каталоге,
      // где есть кнопка «Подписаться», а не подписываем молча по ссылке.
      if (chat.isMember) navigate(`/chat/${chat.id}`, { replace: true });
      else navigate(`/discover-channels?q=${encodeURIComponent(chat.username || chat.title)}`, { replace: true });
      return;
    } catch (err) {
      mount(
        mainSlot,
        el("div", { class: "empty-chat" }, [
          el("p", { class: "empty-chat-title" }, "Ничего не найдено"),
          el("p", { class: "empty-hint" }, `@${username} — такого аккаунта, бота или канала нет.`),
        ])
      );
    }
  }

  route("/u/:username", async (params) => {
    withCleanup(mainSlot);
    await openByUsername(params.username, window.location.search);
  });

  // An invite link (server/routes/chats.js) — a full page, not a dialog: it's
  // opened from outside the app, often by someone not signed in yet, and the
  // router's own auth gate sends them to /login and back.
  route("/join/:code", async (params) => {
    withCleanup(mainSlot);
    const { JoinInviteView } = await import("./views/joinInvite.js");
    await JoinInviteView(mainSlot, params.code);
  });
  route("/contacts", async () => {
    withCleanup(mainSlot);
    const { ContactsView } = await import("./views/contacts.js");
    await ContactsView(mainSlot);
  });
  route("/discover-channels", async () => {
    withCleanup(mainSlot);
    const { DiscoverChannelsView } = await import("./views/discoverChannels.js");
    await DiscoverChannelsView(mainSlot);
  });
  route("/calls", async () => {
    withCleanup(mainSlot);
    const { CallsView } = await import("./views/calls.js");
    await CallsView(mainSlot);
  });
  route("/archive", async () => {
    withCleanup(mainSlot);
    const { ArchiveView } = await import("./views/archive.js");
    await ArchiveView(mainSlot);
  });
  route("/settings", async () => {
    withCleanup(mainSlot);
    const { SettingsView } = await import("./views/settings/index.js");
    await SettingsView(mainSlot, "");
  });
  route("/settings/:page", async (params) => {
    withCleanup(mainSlot);
    const { SettingsView } = await import("./views/settings/index.js");
    await SettingsView(mainSlot, params.page);
  });
  notFound(() => navigate("/", { replace: true }));

  // /@имя — то, как ссылку на бота или канал пишут и вставляют люди. Роутер
  // (router.js) умеет подставлять только целый сегмент пути, поэтому «@» не
  // получится вписать в шаблон маршрута: приводим адрес к /u/имя до старта,
  // сохраняя параметры (?start=…, ?app=1).
  const handleInPath = window.location.pathname.match(/^\/@([A-Za-z0-9_]{1,64})\/?$/);
  if (handleInPath) window.history.replaceState(null, "", `/u/${handleInPath[1]}${window.location.search}`);

  startRouter();
}

// Whatever went wrong, the screen has to say what it was. This used to print
// one flat line — "Не удалось загрузить приложение." — with the actual cause
// only in the console, which is unreachable in the desktop and mobile shells,
// so the single most common case (the server is down or answering 502, and the
// very first request, api.session(), throws) looked identical to a genuine
// crash in the app's own code.
boot().catch((err) => {
  console.error(err);
  // fetch() rejects with a TypeError and no status when the request never
  // reached a server at all — offline, wrong address, backend not running.
  const offline = !navigator.onLine || err instanceof TypeError;
  mount(
    root,
    el("div", { class: "boot-error" }, [
      el("h1", {}, offline ? "Нет связи с сервером" : "Не удалось загрузить приложение"),
      el(
        "p",
        {},
        offline
          ? "Приложение открылось, но сервер Shalter не отвечает. Проверьте интернет — если он есть, значит сервер сейчас недоступен."
          : "Приложение загрузилось, но упало при запуске. Текст ошибки ниже — с ним можно обратиться в поддержку."
      ),
      el("p", { class: "mono boot-error-detail" }, String(err?.message || err)),
      el("button", { class: "btn-accent", onclick: () => window.location.reload() }, "Повторить"),
    ])
  );
});
