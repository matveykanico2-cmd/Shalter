const { contextBridge, ipcRenderer } = require("electron");

// Мост между веб-приложением и десктоп-оболочкой. Страница видит только эти
// функции — без доступа к Node.js и файловой системе.
contextBridge.exposeInMainWorld("shalterDesktop", {
  platform: process.platform,
  // Число непрочитанных → бейдж на иконке, трей, мигание в панели задач.
  setUnread: (count) => ipcRenderer.send("shalter:unread", Number(count) || 0),
  focus: () => ipcRenderer.send("shalter:focus"),
  notify: (title, body, url) => ipcRenderer.send("shalter:notify", { title, body, url }),
  retry: (target) => ipcRenderer.send("shalter:retry", target),
});
