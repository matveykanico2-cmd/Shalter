const { app, BrowserWindow, shell, protocol } = require("electron");
const path = require("path");

const SHALTER_ROOT = path.join(__dirname, "..");
const LOCAL_DIR = path.join(SHALTER_ROOT, "public", "dist");
const LOCAL_INDEX = path.join(LOCAL_DIR, "index.html");

// 1) SHALTER_APP_URL — dev-режим (npm run electron:dev → http://localhost:3000)
// 2) SHALTER_OFFLINE=1 — локальные файлы из public/dist, без сервера.
// 3) server.url из capacitor.config.json — продакшен (https://shalter.ru).
const APP_URL =
  process.env.SHALTER_APP_URL ||
  (process.env.SHALTER_OFFLINE === "1"
    ? null
    : (() => {
        try {
          return require("../capacitor.config.json").server?.url || null;
        } catch {
          return null;
        }
      })());

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: "#f5f6f9",
    icon: path.join(SHALTER_ROOT, "public", "icons", "icon-512.png"),
    title: "Shalter",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!APP_URL) {
    // Офлайн-режим: раздаём локальные файлы через file:// протокол.
    // API-запросы к /api/ работают по HTTPS к вашему серверу — или же
    // переключитесь на Capacitor/Electron-настройку с прокси.
    if (!require("fs").existsSync(LOCAL_INDEX)) {
      console.error(`Shalter desktop: local build not found at ${LOCAL_DIR}. Run "npm run build" first, or set SHALTER_APP_URL.`);
      app.quit();
      return;
    }
    protocol.interceptFileProtocol("file", (req, callback) => {
      const url = req.url.slice("file://".length);
      const clean = decodeURIComponent(url).replace(/^\/|\/$/g, "");
      const resolved = path.join(LOCAL_DIR, clean || "index.html");
      callback({ path: require("fs").existsSync(resolved) ? resolved : LOCAL_INDEX });
    });
    win.loadFile(LOCAL_INDEX);
  } else {
    win.loadURL(APP_URL).catch((err) => {
      console.error("Shalter desktop: failed to load", APP_URL, err);
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
