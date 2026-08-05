import { el, mount, clear } from "./lib/dom.js";
import { api } from "./api.js";
import { setState, getState } from "./state.js";
import { route, notFound, startRouter, navigate } from "./router.js";
import { NavRail } from "./components/navRail.js";
import { ChatListPane } from "./views/chatList.js";
import { LoginView } from "./views/login.js";
import { QrLoginConfirmView } from "./views/qrLoginConfirm.js";
import { ChatView } from "./views/chatView.js";
import { ContactsView } from "./views/contacts.js";
import { CallScreenView } from "./views/callScreen.js";
import { CallsView } from "./views/calls.js";
import { ArchiveView } from "./views/archive.js";
import { SettingsView } from "./views/settings/index.js";
import { mountIncomingCallWatcher } from "./components/incomingCallWatcher.js";
import { startWsClient } from "./lib/wsClient.js";
import { ensurePushSubscribed } from "./lib/push.js";
import { subscribeCall, getCallState, minimize, restore } from "./lib/callController.js";
import { Avatar } from "./components/avatar.js";
import { iconSvg } from "./icons.js";
import { initUiTranslation } from "./lib/uiTranslate.js";
import { hasPasscode } from "./lib/passcodeLock.js";
import { showPasscodeLockScreen } from "./components/passcodeLockScreen.js";

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
    LoginView(root, { addMode: params.get("add") === "1" });
    return;
  }

  // Where a scanned QR code lands — a standalone confirm screen, shown as-is
  // whether or not this browser/device already has a Shalter session (see
  // QrLoginConfirmView), so it deliberately sits outside the authenticated
  // app shell below.
  if (path === "/qr-login") {
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
  startWsClient();
  mountIncomingCallWatcher();
  // Starts observing before the shell below does its first render, so that
  // initial paint gets caught by the same pass as everything after it.
  api
    .getSettings()
    .then(({ settings }) => {
      setState({ settings });
      initUiTranslation(settings.uiLanguage);
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
      el("p", { class: "empty-chat-title" }, "Выберите чат"),
      el("p", { class: "empty-hint" }, "Или начните новый — найдите человека во вкладке «Контакты»."),
    ]));
  });
  route("/chat/:id", async (params) => {
    withCleanup(mainSlot);
    await ChatView(mainSlot, params.id);
  });
  route("/call/:id", async (params) => {
    withCleanup(mainSlot);
    await CallScreenView(mainSlot, params.id);
  });
  route("/contacts", async () => {
    withCleanup(mainSlot);
    await ContactsView(mainSlot);
  });
  route("/calls", async () => {
    withCleanup(mainSlot);
    await CallsView(mainSlot);
  });
  route("/archive", async () => {
    withCleanup(mainSlot);
    await ArchiveView(mainSlot);
  });
  route("/settings", async () => {
    withCleanup(mainSlot);
    await SettingsView(mainSlot, "");
  });
  route("/settings/:page", async (params) => {
    withCleanup(mainSlot);
    await SettingsView(mainSlot, params.page);
  });
  notFound(() => navigate("/", { replace: true }));

  startRouter();
}

boot().catch((err) => {
  console.error(err);
  mount(root, el("div", { class: "empty-hint" }, "Не удалось загрузить приложение."));
});
