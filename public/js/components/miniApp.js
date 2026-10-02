import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { openDropdownMenu } from "./dropdownMenu.js";

const BRIDGE_VERSION = 1;

function currentTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function openMiniApp({ botId, botName, chatId = null, url = null, appName = null }) {
  let session = null;
  let appOrigin = null;
  let error = null;
  let loaded = false;
  let closed = false;

  const overlay = el("div", { class: "mini-app-overlay" });
  const titleEl = el("p", { class: "mini-app-title" }, appName || botName || "Приложение");
  const subtitleEl = el("p", { class: "mini-app-subtitle" }, botName ? `бот ${botName}` : "");
  const body = el("div", { class: "mini-app-body" });
  const frameSlot = el("div", { class: "mini-app-frame-slot" }, [body]);

  let mainButton = { text: "", visible: false, disabled: false, loading: false };
  const mainButtonEl = el("button", {
    class: "mini-app-main-btn",
    onclick: () => {
      if (mainButton.disabled || mainButton.loading) return;
      post({ type: "event", event: "mainButtonClicked" });
    },
  });

  const header = el("div", { class: "mini-app-header" }, [
    el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 18), onclick: () => close() }),
    el("div", { class: "mini-app-titles" }, [titleEl, subtitleEl]),
    el("button", {
      class: "icon-btn",
      title: "Ещё",
      html: iconSvg("More", 18),
      onclick: (e) =>
        openDropdownMenu({ x: e.clientX, y: e.clientY }, [
          { icon: "Download", label: "Перезагрузить", onClick: () => reload() },
          {
            icon: "Globe",
            label: "Открыть в браузере",
            onClick: () => session && window.open(stripInitData(session.url), "_blank", "noreferrer"),
          },
        ]),
    }),
  ]);

  overlay.append(header, frameSlot, mainButtonEl);
  document.body.appendChild(overlay);

  let iframe = null;

  function stripInitData(full) {
    try {
      const u = new URL(full);
      u.hash = "";
      return u.toString();
    } catch {
      return full;
    }
  }

  function post(message) {
    if (!iframe?.contentWindow || !appOrigin) return;
    const target = appOrigin === window.location.origin ? "*" : appOrigin;
    iframe.contentWindow.postMessage({ source: "shalter", v: BRIDGE_VERSION, ...message }, target);
  }

  function reply(id, ok, valueOrError) {
    if (!id) return;
    post({ type: "result", id, ok, ...(ok ? { value: valueOrError } : { error: String(valueOrError ?? "error") }) });
  }

  const HANDLERS = {
    ready: () => {
      loaded = true;
      renderState();
    },
    close: () => close(),
    sendData: async ({ data }, id) => {
      try {
        const text = String(data ?? "");
        if (!text.trim()) throw new Error("Пустые данные");
        await api.sendBotAppData(botId, text);
        reply(id, true, { ok: true });
        close();
      } catch (err) {
        reply(id, false, err.message || "Не удалось отправить");
      }
    },
    openLink: ({ url: link }, id) => {
      try {
        const u = new URL(String(link));
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Только http(s)");
        window.open(u.toString(), "_blank", "noreferrer");
        reply(id, true, { ok: true });
      } catch (err) {
        reply(id, false, err.message || "Некорректная ссылка");
      }
    },
    showAlert: ({ message }, id) => {
      window.alert(String(message ?? "").slice(0, 500));
      reply(id, true, { ok: true });
    },
    showConfirm: ({ message }, id) => {
      const ok = window.confirm(String(message ?? "").slice(0, 500));
      reply(id, true, { confirmed: ok });
    },
    mainButton: (payload) => {
      mainButton = {
        text: String(payload?.text ?? mainButton.text).slice(0, 64),
        visible: payload?.visible !== false,
        disabled: !!payload?.disabled,
        loading: !!payload?.loading,
      };
      renderMainButton();
    },
  };

  function onMessage(e) {
    if (!iframe || e.source !== iframe.contentWindow) return;
    const msg = e.data;
    if (!msg || msg.source !== "shalter-web-app" || typeof msg.method !== "string") return;
    const handler = HANDLERS[msg.method];
    if (!handler) {
      reply(msg.id, false, `Неизвестный метод ${msg.method}`);
      return;
    }
    Promise.resolve(handler(msg.payload ?? {}, msg.id)).catch((err) => reply(msg.id, false, err?.message || "error"));
  }
  window.addEventListener("message", onMessage);

  function renderMainButton() {
    mainButtonEl.className = `mini-app-main-btn ${mainButton.visible && mainButton.text ? "shown" : ""} ${mainButton.loading ? "loading" : ""}`;
    mainButtonEl.disabled = mainButton.disabled || mainButton.loading;
    mainButtonEl.textContent = mainButton.loading ? "…" : mainButton.text;
  }

  function renderState() {
    clear(body);
    if (error) {
      body.append(
        el("div", { class: "mini-app-message" }, [
          el("p", { class: "login-error" }, error),
          el("button", { class: "profile-action-btn", onclick: () => start() }, "Попробовать снова"),
        ])
      );
      return;
    }
    if (!loaded) body.append(el("div", { class: "mini-app-message" }, [el("p", { class: "settings-toggle-hint" }, "Открываем приложение…")]));
  }

  function mountFrame(fullUrl) {
    iframe?.remove();
    const hosted = appOrigin === window.location.origin;
    iframe = el("iframe", {
      class: "mini-app-frame",
      src: fullUrl,
      sandbox: hosted
        ? "allow-scripts allow-forms allow-popups allow-modals"
        : "allow-scripts allow-same-origin allow-forms allow-popups allow-modals",
      onload: () => {
        loaded = true;
        renderState();
      },
    });
    frameSlot.insertBefore(iframe, body);
  }

  function reload() {
    if (!session) return;
    loaded = false;
    renderState();
    mountFrame(session.url);
  }

  async function start() {
    error = null;
    loaded = false;
    renderState();
    try {
      session = await api.openBotApp(botId, { url, chatId, theme: currentTheme() });
      appOrigin = new URL(session.url).origin;
      titleEl.textContent = appName || session.name;
      mountFrame(session.url);
    } catch (err) {
      error = err.message || "Не удалось открыть приложение";
      renderState();
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener("message", onMessage);
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  renderMainButton();
  start();
  return { close };
}
