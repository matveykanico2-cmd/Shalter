// Desktop shell for Windows/Linux/macOS — same idea as capacitor.config.json
// for mobile: Shalter is a server-backed app (WebSocket signaling, SQLite,
// sessions — see AGENTS.md), so this isn't "bundle the files into the app,"
// it's "point a native window at your already-deployed HTTPS server." No
// separate desktop codebase to maintain — every feature added to public/
// shows up here for free.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// Reuses capacitor.config.json's server.url as the single place to configure
// "which deployment does the app point at" — one edit covers mobile and
// desktop. SHALTER_APP_URL overrides it for local development (see
// `npm run electron:dev`, which points this at `npm run dev`'s localhost).
const capacitorConfig = require("../capacitor.config.json");
const APP_URL = process.env.SHALTER_APP_URL || capacitorConfig.server?.url;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: "#f5f6f9",
    icon: path.join(__dirname, "..", "public", "icons", "icon-512.png"),
    title: "Shalter",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Anything that isn't a plain in-app navigation (call links, external
  // "open in browser" style links) should open in the OS browser instead of
  // hijacking the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  if (!APP_URL || APP_URL.includes("REPLACE-WITH-YOUR-DEPLOYED-DOMAIN")) {
    console.error(
      "Shalter desktop: no server URL configured. Set server.url in capacitor.config.json to your deployed domain (see DEPLOY.md), or run via `npm run electron:dev` against a local `npm run dev` server."
    );
  }
  createWindow();

  // macOS convention: clicking the dock icon with no windows open should
  // reopen one instead of requiring a relaunch.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows/Linux convention: closing the last window quits the app. macOS
// convention: the app stays running in the dock until Cmd+Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
