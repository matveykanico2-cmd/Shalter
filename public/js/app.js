import { applyAccentSetting, applyFontSizeSetting } from "./lib/accent.js";
import { el, mount, clear } from "./lib/dom.js";
import { api } from "./api.js";
import { setState, getState, updateSelf } from "./state.js";
import { playIncomingMessageSound } from "./lib/ringtone.js";
import { isChatMuted } from "./lib/chatSort.js";
import { route, notFound, startRouter, navigate } from "./router.js";
import { NavRail } from "./components/navRail.js";
import { ChatListPane } from "./views/chatList.js";
import { mountIncomingCallWatcher, answerCall } from "./components/incomingCallWatcher.js";
import { openMiniApp } from "./components/miniApp.js";
import { loadSafetyLabels } from "./lib/safetyLabels.js";
import { startWsClient, onWsMessage } from "./lib/wsClient.js";
import { initNetStatus } from "./lib/netStatus.js";
import { ensurePushSubscribed } from "./lib/push.js";
import { startVersionWatch } from "./lib/appVersion.js";
import { subscribeCall, getCallState, minimize, restore } from "./lib/callController.js";
import { applyVolume } from "./lib/mediaVolume.js";
import { Avatar } from "./components/avatar.js";
import { iconSvg } from "./icons.js";
import { initUiTranslation } from "./lib/uiTranslate.js";
import { hasPasscode } from "./lib/passcodeLock.js";
import { showPasscodeLockScreen } from "./components/passcodeLockScreen.js";
import { showPasswordLockScreen } from "./components/passwordLockScreen.js";
import { initKeyboardShortcuts } from "./lib/keyboardShortcuts.js";
import { initRipple } from "./lib/ripple.js";
import { ChatTips } from "./components/chatTips.js";
import { paintWallpaper } from "./lib/wallpapers.js";
import { installToastAlert, installModalEscape } from "./components/toast.js";
import { installEmojiImages } from "./lib/emojiImages.js";

installToastAlert();
installModalEscape();
installEmojiImages();

const root = document.getElementById("view-root");

function removeSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.classList.add("boot-splash-hidden");
  setTimeout(() => splash.remove(), 300);
}

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
    removeSplash();
    return;
  }

  if (path === "/qr-login") {
    const { QrLoginConfirmView } = await import("./views/qrLoginConfirm.js");
    await QrLoginConfirmView(root);
    removeSplash();
    return;
  }

  if (path === "/oauth/authorize") {
    const { OAuthAuthorizeView } = await import("./views/oauthAuthorize.js");
    await OAuthAuthorizeView(root);
    removeSplash();
    return;
  }

  const { user, accounts } = await api.session();
  if (!user || !user.name) {
    window.location.href = "/login";
    return;
  }
  removeSplash();
  if (hasPasscode()) await showPasscodeLockScreen();
  const RELOCK_THRESHOLD_MS = 5000;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (document.visibilityState === "visible" && hasPasscode() && Date.now() - hiddenAt >= RELOCK_THRESHOLD_MS) {
      showPasscodeLockScreen();
    }
  });

  setState({ user, accounts });
  const bootData = api
    .bootstrap()
    .then((data) => {
      if (!data) return null;
      setState({ contactIds: data.contactIds, chats: data.chats, folders: data.folders });
      return data;
    })
    .catch(() => null);
  bootData.finally(() => setState({ chatsLoaded: true }));
  loadSafetyLabels(api).catch(() => {});
  startWsClient();
  initNetStatus();
  onWsMessage("self:updated", (msg) => {
    if (msg.user?.id === getState().user?.id) updateSelf(msg.user);
  });
  onWsMessage("message:new", (msg) => {
    const { user: me, settings, chats } = getState();
    if (!msg.message || msg.silent || msg.message.senderId === me?.id || settings?.notifications?.sound === false) return;
    if (document.visibilityState !== "visible") return;
    const chat = (chats ?? []).find((c) => c.id === msg.chatId);
    if (chat && isChatMuted(chat)) return;
    playIncomingMessageSound();
  });
  onWsMessage("contact:updated", (msg) => {
    if (msg.user?.id === getState().user?.id) updateSelf(msg.user);
  });
  window.addEventListener("shalter:contacts-changed", async (e) => {
    const { forgetUser, fetchUsers } = await import("./lib/userLookup.js");
    forgetUser(e.detail?.userId);
    fetchUsers([e.detail?.userId]).catch(() => {});
    api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
    api.getContactIds().then((r) => setState({ contactIds: r.ids })).catch(() => {});
  });
  mountIncomingCallWatcher();
  initKeyboardShortcuts();
  initRipple();
  bootData
    .then((data) => (data ? { settings: data.settings } : api.getSettings()))
    .then(({ settings }) => {
      setState({ settings });
      if (settings?.requirePasswordOnLaunch) showPasswordLockScreen(root);
      initUiTranslation(settings.uiLanguage);
      if (settings.theme && settings.theme !== "system") document.documentElement.setAttribute("data-theme", settings.theme);
      applyAccentSetting(settings.accent);
      applyFontSizeSetting(settings.fontSize);
      document.documentElement.toggleAttribute("data-reduce-motion", !!settings.reduceMotion);
    })
    .catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  ensurePushSubscribed().catch(() => {});
  import("./components/permissionsDialog.js")
    .then(({ openPermissionsDialog, permissionsAlreadyAsked }) => {
      if (permissionsAlreadyAsked()) return;
      setTimeout(() => openPermissionsDialog(), 1500);
    })
    .catch(() => {});
  startVersionWatch();
  const prefetchChat = () => import("./views/chatView.js").catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(prefetchChat, { timeout: 3000 });
  else setTimeout(prefetchChat, 1200);

  const shell = el("div", { class: "shell" });
  const HOLIDAYS = [{ date: "09-25", title: "🎉 С Днём основания Shalter!" }];
  (function holidayBanner() {
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const today = HOLIDAYS.find((h) => h.date === mmdd);
    if (!today) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem("holidayDismissed") === mmdd; } catch {}
    if (dismissed) return;
    const banner = el("div", { class: "holiday-banner" }, [
      el("span", { class: "holiday-banner-text" }, today.title),
      el("button", {
        class: "holiday-banner-close",
        title: "Скрыть",
        html: iconSvg("X", 14),
        onclick: () => {
          try { localStorage.setItem("holidayDismissed", mmdd); } catch {}
          banner.remove();
        },
      }),
    ]);
    shell.appendChild(banner);
  })();
  const listCol = el("div", { class: "shell-list-col" });
  const sidebar = el("div", { class: "shell-sidebar" });
  const mainSlot = el("div", { class: "shell-main-col" });
  const callBubbleSlot = el("div", { class: "call-bubble-slot" });
  const callAudioSink = el("div", { class: "call-audio-sink", hidden: true });
  mount(root, shell);
  shell.append(listCol, mainSlot, callBubbleSlot, callAudioSink);
  // Как SidebarSlider в tweb: на компьютере настройки, контакты, звонки и архив выезжают
  // поверх списка чатов, а открытый справа чат остаётся на месте.
  const sidePage = el("div", { class: "shell-side-page" });
  sidebar.append(ChatListPane(), sidePage);
  listCol.append(NavRail(), sidebar);

  function emptyChatPlaceholder() {
    const s = getState().settings;
    // Как в tweb: вместо заглушки — карточки-подсказки (оформление, недавние чаты).
    const box = el("div", { class: "empty-chat message-list empty-chat-tips" }, [ChatTips()]);
    paintWallpaper(box, { id: s?.chatWallpaper ?? "default", image: s?.chatWallpaperImage });
    return box;
  }

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
  const callAudioEls = new Map();
  function syncCallAudio() {
    const s = getCallState();
    const streams = s?.remoteStreams ?? {};
    for (const [id, node] of callAudioEls) {
      if (!streams[id]) {
        node.srcObject = null;
        node.remove();
        callAudioEls.delete(id);
      }
    }
    for (const [id, stream] of Object.entries(streams)) {
      if (!stream) continue;
      let node = callAudioEls.get(id);
      if (!node) {
        node = el("audio", { autoplay: true });
        callAudioEls.set(id, node);
        callAudioSink.appendChild(node);
      }
      if (node.srcObject !== stream) node.srcObject = stream;
      applyVolume(node);
    }
  }

  subscribeCall(renderCallBubble);
  subscribeCall(syncCallAudio);
  renderCallBubble();
  syncCallAudio();

  const FULL_PAGE_ROUTES = ["/contacts", "/calls", "/archive", "/discover-channels", "/settings"];
  const SIDE_ROUTES = ["/contacts", "/calls", "/archive", "/settings"];
  const matchesAny = (list, p) => list.some((r) => p === r || p.startsWith(`${r}/`));
  const desktopQuery = window.matchMedia("(min-width: 768px)");
  const isSide = (p) => desktopQuery.matches && matchesAny(SIDE_ROUTES, p);
  const isFullPage = (p) => matchesAny(FULL_PAGE_ROUTES, p) && !isSide(p);

  const sectionOf = (p) => p.split("/")[1] ?? "";
  let prevPath = path;
  // последний путь, отрисованный в правой колонке, — туда возвращаемся, закрыв боковую панель
  let lastMainPath = isSide(path) ? "/" : path;
  let closingSide = false;
  let restoredPath = null;
  let restoring = false;
  function applyShellClasses(p) {
    const side = isSide(p);
    shell.classList.toggle("chat-open", side ? lastMainPath !== "/" : p !== "/");
    shell.classList.toggle("full-open", isFullPage(p));
    shell.classList.toggle("side-open", side);
  }
  window.addEventListener("app:navigate", ({ detail }) => {
    const side = isSide(detail.path);
    const wasSide = isSide(prevPath);
    closingSide = wasSide && !side;
    applyShellClasses(detail.path);
    if (side) {
      if (!wasSide) restoredPath = lastMainPath;
      if (sectionOf(prevPath) !== sectionOf(detail.path)) {
        withCleanup(sidePage);
        clear(sidePage);
      }
      if (!mainSlot.firstChild) mount(mainSlot, emptyChatPlaceholder());
      prevPath = detail.path;
      return;
    }
    if (wasSide) {
      withCleanup(sidePage);
      clear(sidePage);
    }
    if (restoring) {
      // возврат к чату после боковой панели: правая колонка уже показывает его
      restoring = false;
      shell.classList.toggle("chat-open", true);
    } else {
      if (closingSide && detail.path === "/" && restoredPath && restoredPath !== "/") {
        // кнопка «назад» в панели ведёт на «/» — вместо пустого экрана вернёмся к прежнему чату
        prevPath = detail.path;
        return;
      }
      // правая колонка сменит содержимое — чат, что там был, больше не «уже открыт»
      if (!wasSide) mainSlot.dataset.path = "";
      const from = wasSide ? lastMainPath : prevPath;
      if (sectionOf(from) !== sectionOf(detail.path)) clear(mainSlot);
    }
    lastMainPath = detail.path;
    if (prevPath.startsWith("/call/") && !detail.path.startsWith("/call/")) {
      const s = getCallState();
      if (s && !s.minimized) minimize();
    }
    prevPath = detail.path;
  });
  applyShellClasses(path);

  function sideOrMain(p) {
    if (isSide(p)) return sidePage;
    mainSlot.dataset.path = p;
    return mainSlot;
  }

  // Закрыли боковую панель кнопкой «назад» (она ведёт на «/») — возвращаемся к чату, что был справа.
  route("/", () => {
    if (closingSide && restoredPath && restoredPath !== "/") {
      const back = restoredPath;
      restoredPath = null;
      restoring = true;
      navigate(back, { replace: true });
      return;
    }
    withCleanup(mainSlot);
    mount(mainSlot, emptyChatPlaceholder());
    mainSlot.dataset.path = "/";
  });
  route("/chat/:id", async (params) => {
    // чат уже открыт справа (вернулись из боковой панели) — не перерисовываем
    if (mainSlot.dataset.path === window.location.pathname && mainSlot.firstChild) return;
    mainSlot.dataset.path = window.location.pathname;
    withCleanup(mainSlot);
    const { ChatView } = await import("./views/chatView.js");
    await ChatView(mainSlot, params.id);
  });
  route("/call/:id", async (params) => {
    withCleanup(mainSlot);
    if (new URLSearchParams(window.location.search).get("answer") === "1") {
      window.history.replaceState(null, "", `/call/${params.id}`);
      await answerCall(params.id).catch(() => {});
    }
    const { CallScreenView } = await import("./views/callScreen.js");
    await CallScreenView(mainSlot, params.id);
  });
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
  async function openByUsername(username, search) {
    username = String(username || "").replace(/^@/, "");
    const params = new URLSearchParams(search || "");
    const startPayload = params.get("start");
    const wantsApp = params.get("app") === "1" || params.has("startapp");

    // Своя ссылка t.me/<ник> в Telegram открывает «Избранное».
    const me = getState().user;
    if (me?.username && me.username.toLowerCase() === username.toLowerCase()) {
      const { openSavedMessages } = await import("./components/sidebarMenu.js");
      await openSavedMessages();
      return;
    }

    try {
      const { user: found } = await api.findUserByUsername(username);
      const { chat } = await api.startDm(found.id, found.name, found.avatarColor);
      if (found.isBot && startPayload) {
        await api.sendMessage(chat.id, `/start ${startPayload}`.trim()).catch(() => {});
      }
      api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
      navigate(`/chat/${chat.id}`, { replace: true });
      if (found.isBot && wantsApp) openMiniApp({ botId: found.id, botName: found.name, chatId: chat.id });
      return;
    } catch {
    }

    try {
      const { chat } = await api.findChatByUsername(username);
      const msg = params.get("msg");
      if (chat.isMember) {
        navigate(`/chat/${chat.id}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`, { replace: true });
        return;
      }
      const { JoinPublicView } = await import("./views/joinInvite.js");
      await JoinPublicView(mainSlot, chat, { msg });
      return;
    } catch (err) {
      mount(
        mainSlot,
        el("div", { class: "empty-chat" }, [
          el("p", { class: "empty-chat-title" }, "Ничего не найдено"),
          el("p", { class: "empty-hint" }, `@${username} — такого аккаунта, бота или канала нет.`),
          el("button", { class: "btn-accent empty-chat-action", onclick: () => navigate("/") }, "К чатам"),
        ])
      );
    }
  }

  route("/u/:username", async (params) => {
    withCleanup(mainSlot);
    await openByUsername(params.username, window.location.search);
  });

  route("/join/:code", async (params) => {
    withCleanup(mainSlot);
    const { JoinInviteView } = await import("./views/joinInvite.js");
    await JoinInviteView(mainSlot, params.code);
  });
  route("/community/:id", async (params) => {
    withCleanup(mainSlot);
    const { CommunityView } = await import("./views/community.js");
    await CommunityView(mainSlot, params.id);
  });
  route("/folder/:code", async (params) => {
    withCleanup(mainSlot);
    const { FolderInviteView } = await import("./views/folderInvite.js");
    await FolderInviteView(mainSlot, params.code);
  });
  route("/nearby", async () => {
    withCleanup(mainSlot);
    const { NearbyView } = await import("./views/nearby.js");
    await NearbyView(mainSlot);
  });
  route("/contacts", async () => {
    const slot = sideOrMain("/contacts");
    withCleanup(slot);
    const { ContactsView } = await import("./views/contacts.js");
    await ContactsView(slot);
  });
  route("/discover-channels", async () => {
    withCleanup(mainSlot);
    const { DiscoverChannelsView } = await import("./views/discoverChannels.js");
    await DiscoverChannelsView(mainSlot);
  });
  route("/calls", async () => {
    const slot = sideOrMain("/calls");
    withCleanup(slot);
    const { CallsView } = await import("./views/calls.js");
    await CallsView(slot);
  });
  route("/archive", async () => {
    const slot = sideOrMain("/archive");
    withCleanup(slot);
    const { ArchiveView } = await import("./views/archive.js");
    await ArchiveView(slot);
  });
  async function openSettings(page) {
    const slot = sideOrMain(window.location.pathname);
    withCleanup(slot);
    const { SettingsView } = await import("./views/settings/index.js");
    await SettingsView(slot, page);
  }
  route("/settings", () => openSettings(""));
  route("/settings/:page", (params) => openSettings(params.page));
  notFound(() => navigate("/", { replace: true }));

  const RESERVED_PATHS = new Set([
    "u", "chat", "call", "call-join", "join", "folder", "nearby", "contacts",
    "discover-channels", "market", "calls", "archive", "settings", "login",
    "download", "promo", "bots", "oauth-docs",
  ]);
  const handleInPath = window.location.pathname.match(/^\/@?([A-Za-z0-9_]{3,32})\/?$/);
  if (handleInPath && !RESERVED_PATHS.has(handleInPath[1].toLowerCase())) {
    window.history.replaceState(null, "", `/u/${handleInPath[1]}${window.location.search}`);
  }

  startRouter();
}

boot().catch((err) => {
  console.error(err);
  removeSplash();
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
