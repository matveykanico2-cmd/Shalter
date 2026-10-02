const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
