const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, session, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

// Нативное десктоп-приложение Shalter: окно с живым сервером (как Telegram Desktop
// поверх веб-версии), трей со счётчиком непрочитанных, бейдж на иконке, меню,
// контекстное меню с орфографией, запоминание окна, один экземпляр, ссылки
// shalter://, разрешения для звонков и экран «нет связи» с автоповтором.

// Linux: Chrome sandbox внутри Electron часто не настроен в контейнерах/образах.
if (process.platform === "linux" && !process.env.SHALTER_ENABLE_SANDBOX) {
  app.commandLine.appendSwitch("--no-sandbox");
}

const ICON = path.join(__dirname, "icon.png");
const PROTOCOL = "shalter";

// 1) SHALTER_APP_URL — dev-режим (npm run electron:dev → http://localhost:3000)
// 2) server.url из capacitor.config.json — продакшен (https://shalter.ru).
const APP_URL = (() => {
  if (process.env.SHALTER_APP_URL) return process.env.SHALTER_APP_URL;
  try {
    return require("../capacitor.config.json").server?.url || "https://shalter.ru";
  } catch {
    return "https://shalter.ru";
  }
})();
const APP_ORIGIN = new URL(APP_URL).origin;

let win = null;
let tray = null;
let quitting = false;
let unread = 0;
let retryTimer = null;

// ---------- один экземпляр и ссылки shalter:// ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    showWindow();
    const link = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (link) openDeepLink(link);
  });
}

if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient(PROTOCOL);

app.on("open-url", (e, url) => {
  e.preventDefault();
  if (win) openDeepLink(url);
  else app.once("browser-window-created", () => setTimeout(() => openDeepLink(url), 500));
});

// shalter://chat/abc → https://shalter.ru/chat/abc
function openDeepLink(link) {
  try {
    const u = new URL(link);
    const target = `${APP_ORIGIN}/${[u.host, u.pathname.replace(/^\//, "")].filter(Boolean).join("/")}${u.search}`;
    showWindow();
    win?.loadURL(target);
  } catch {}
}

// ---------- состояние окна ----------

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return { width: 1280, height: 840 };
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {}
}

// ---------- окно ----------

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function createWindow() {
  const state = loadWindowState();
  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 380,
    minHeight: 480,
    show: false,
    backgroundColor: "#f5f6f9",
    icon: ICON,
    title: "Shalter",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (state.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());

  // Свои страницы открываем в окне, всё остальное — в браузере по умолчанию.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    if (/^https?:|^mailto:|^tg:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isAppUrl(url) || url.startsWith("data:") || url.startsWith("file:")) return;
    e.preventDefault();
    shell.openExternal(url);
  });

  // Нет сети или сервер не ответил — экран с автоповтором вместо закрытия приложения.
  win.webContents.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 — загрузка отменена переходом
    showOfflinePage(url || APP_URL, description);
  });

  win.webContents.on("context-menu", (_e, params) => buildContextMenu(params).popup({ window: win }));

  // Закрытие окна сворачивает в трей (как Telegram Desktop); выход — из меню или трея.
  win.on("close", (e) => {
    saveWindowState();
    if (!quitting && tray && process.platform !== "darwin") {
      e.preventDefault();
      win.hide();
    } else if (!quitting && process.platform === "darwin") {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("resize", debounce(saveWindowState, 500));
  win.on("move", debounce(saveWindowState, 500));
  win.on("focus", () => win.flashFrame(false));

  win.loadURL(APP_URL);
}

function showOfflinePage(target, description) {
  clearTimeout(retryTimer);
  const page = path.join(__dirname, "offline.html");
  win.loadFile(page, { query: { target, reason: description || "" } }).catch(() => {});
  // Пробуем снова раз в 5 секунд, пока сервер не ответит.
  retryTimer = setTimeout(() => reconnect(target), 5000);
}

async function reconnect(target) {
  clearTimeout(retryTimer);
  try {
    const res = await fetch(`${APP_ORIGIN}/manifest.webmanifest`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.status < 500) {
      win.loadURL(isAppUrl(target) ? target : APP_URL);
      return;
    }
  } catch {}
  retryTimer = setTimeout(() => reconnect(target), 5000);
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

// ---------- меню ----------

function buildContextMenu(params) {
  const items = [];
  for (const s of params.dictionarySuggestions ?? []) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
  if (params.misspelledWord) {
    items.push({ label: "Добавить в словарь", click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: "separator" });
  }
  if (params.linkURL && !params.linkURL.startsWith("javascript:")) {
    items.push(
      { label: "Открыть ссылку в браузере", click: () => shell.openExternal(params.linkURL) },
      { label: "Скопировать ссылку", click: () => require("electron").clipboard.writeText(params.linkURL) },
      { type: "separator" }
    );
  }
  if (params.mediaType === "image" && params.srcURL) {
    items.push(
      { label: "Скопировать изображение", click: () => win.webContents.copyImageAt(params.x, params.y) },
      { label: "Сохранить изображение…", click: () => win.webContents.downloadURL(params.srcURL) },
      { type: "separator" }
    );
  }
  if (params.isEditable) {
    items.push({ role: "undo", label: "Отменить" }, { role: "redo", label: "Повторить" }, { type: "separator" }, { role: "cut", label: "Вырезать" });
  }
  if (params.isEditable || params.selectionText) items.push({ role: "copy", label: "Копировать" });
  if (params.isEditable) items.push({ role: "paste", label: "Вставить" }, { role: "selectAll", label: "Выделить всё" });
  // Пустое меню не показываем — оставляем веб-приложению его собственные меню.
  return Menu.buildFromTemplate(items.length ? items : [{ role: "reload", label: "Обновить" }]);
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ label: "Shalter", submenu: [{ role: "about", label: "О Shalter" }, { type: "separator" }, { role: "hide", label: "Скрыть" }, { role: "hideOthers", label: "Скрыть остальные" }, { type: "separator" }, { label: "Выйти", accelerator: "Cmd+Q", click: quit }] }] : []),
    {
      label: "Файл",
      submenu: [
        { label: "Новое окно чатов", accelerator: "CmdOrCtrl+N", click: () => (showWindow(), win.loadURL(APP_URL)) },
        { label: "Настройки", accelerator: "CmdOrCtrl+,", click: () => (showWindow(), win.loadURL(`${APP_ORIGIN}/settings`)) },
        { type: "separator" },
        isMac ? { role: "close", label: "Закрыть окно" } : { label: "Выйти", accelerator: "Ctrl+Q", click: quit },
      ],
    },
    {
      label: "Правка",
      submenu: [
        { role: "undo", label: "Отменить" },
        { role: "redo", label: "Повторить" },
        { type: "separator" },
        { role: "cut", label: "Вырезать" },
        { role: "copy", label: "Копировать" },
        { role: "paste", label: "Вставить" },
        { role: "selectAll", label: "Выделить всё" },
      ],
    },
    {
      label: "Вид",
      submenu: [
        { role: "reload", label: "Обновить" },
        { role: "forceReload", label: "Обновить без кэша" },
        { role: "toggleDevTools", label: "Инструменты разработчика" },
        { type: "separator" },
        { role: "resetZoom", label: "Обычный масштаб" },
        { role: "zoomIn", label: "Увеличить" },
        { role: "zoomOut", label: "Уменьшить" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Во весь экран" },
      ],
    },
    { label: "Окно", submenu: [{ role: "minimize", label: "Свернуть" }, { role: "zoom", label: "Масштаб окна" }, ...(isMac ? [{ role: "front", label: "Все окна наверх" }] : [])] },
    { label: "Справка", submenu: [{ label: "Сайт Shalter", click: () => shell.openExternal(APP_ORIGIN) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- трей и счётчик ----------

function createTray() {
  if (process.platform === "darwin") return; // на macOS есть Dock с бейджем
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 22, height: 22 }));
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip("Shalter");
  tray.on("click", () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(unread ? `Shalter — непрочитанных: ${unread}` : "Shalter");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: unread ? `Открыть Shalter (${unread})` : "Открыть Shalter", click: showWindow },
      { type: "separator" },
      { label: "Выйти", click: quit },
    ])
  );
}

function setUnread(count) {
  unread = Math.max(0, Math.floor(Number(count) || 0));
  app.setBadgeCount(unread); // macOS Dock и Linux (Unity/KDE)
  if (process.platform === "win32" && win) {
    win.setOverlayIcon(unread ? badgeImage(unread) : null, unread ? `Непрочитанных: ${unread}` : "");
  }
  if (unread && win && !win.isFocused()) win.flashFrame(true);
  updateTrayMenu();
}

// Красный кружок с числом для панели задач Windows.
function badgeImage(count) {
  const text = count > 99 ? "99+" : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="#e53935"/><text x="16" y="21.5" font-family="Segoe UI, Arial" font-size="${text.length > 2 ? 12 : 16}" font-weight="700" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function quit() {
  quitting = true;
  app.quit();
}

// ---------- связь со страницей (preload.js) ----------

ipcMain.on("shalter:unread", (_e, count) => setUnread(count));
ipcMain.on("shalter:focus", () => showWindow());
ipcMain.on("shalter:retry", (_e, target) => reconnect(target));
ipcMain.on("shalter:notify", (_e, { title, body, url } = {}) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: String(title ?? "Shalter"), body: String(body ?? ""), icon: ICON, silent: false });
  n.on("click", () => {
    showWindow();
    if (url && isAppUrl(url)) win.loadURL(url);
  });
  n.show();
});

// ---------- запуск ----------

app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId("ru.shalter.app");

  // Камера, микрофон, уведомления, буфер обмена, демонстрация экрана — только для своего сервера.
  const ALLOWED = new Set(["media", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "display-capture", "mediaKeySystem", "geolocation"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(ALLOWED.has(permission) && isAppUrl(wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => ALLOWED.has(permission) && (origin === APP_ORIGIN || isAppUrl(wc?.getURL?.() ?? "")));
  // Демонстрация экрана в звонках: отдаём весь первый экран.
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    require("electron").desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => callback({ video: sources[0], audio: process.platform === "win32" ? "loopback" : undefined }), () => callback({}));
  });

  buildAppMenu();
  createWindow();
  createTray();

  const link = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (link) setTimeout(() => openDeepLink(link), 800);

  app.on("activate", showWindow);
});

app.on("before-quit", () => {
  quitting = true;
  saveWindowState();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
