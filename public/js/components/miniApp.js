import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { openDropdownMenu } from "./dropdownMenu.js";

// Мини-приложение бота: его страница, открытая внутри Shalter.
//
// Отличие от встроенного браузера (components/inAppBrowser.js), в остальном
// очень похожего, — в двух вещах. Первая: адрес приходит с сервера подписанным
// (server/lib/miniApp.js), поэтому страница достоверно знает, кто её открыл, и
// боту не нужно ни логина, ни пароля. Вторая: между страницей и приложением
// есть мост на postMessage — она может закрыться сама, отправить данные боту и
// показать нижнюю кнопку, ту самую, что в Telegram называется MainButton.
//
// Мост намеренно узкий. Внутри iframe чужой код на чужом домене; всё, что он
// может, — перечислено в HANDLERS ниже, и каждый пункт делает ровно одно
// понятное действие от имени человека, который сам открыл это приложение.

// Что умеет мост. Версия ставится в сообщения, чтобы страница, написанная под
// будущую версию, могла это заметить, а не гадать.
const BRIDGE_VERSION = 1;

function currentTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Единственная точка входа. botId — это userId бота (у бота они совпадают,
// см. server/data/bots.js), url — необязательная страница внутри приложения,
// которую попросила открыть кнопка (сервер проверит, что она из того же
// приложения, а не с чужого сайта).
export function openMiniApp({ botId, botName, chatId = null, url = null, appName = null }) {
  let session = null; // { url, name } — приходит с сервера, уже подписанный
  let appOrigin = null;
  let error = null;
  let loaded = false;
  let closed = false;

  const overlay = el("div", { class: "mini-app-overlay" });
  const titleEl = el("p", { class: "mini-app-title" }, appName || botName || "Приложение");
  const subtitleEl = el("p", { class: "mini-app-subtitle" }, botName ? `бот ${botName}` : "");
  const body = el("div", { class: "mini-app-body" });
  const frameSlot = el("div", { class: "mini-app-frame-slot" }, [body]);

  // Нижняя кнопка. Живёт в шелле, а не внутри страницы, ровно ради того, для
  // чего она нужна: на телефоне это единственная кнопка, до которой дотягивается
  // большой палец, и она не должна уезжать вместе с прокруткой содержимого.
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
            // Открывается настоящий адрес приложения, без подписи в якоре:
            // ссылка уезжает в историю обычного браузера и в буфер обмена, а
            // подпись — это ключ ко входу от имени человека.
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
    // У страницы в песочнице источник «пустой» (null), и адресовать сообщение
    // конкретному домену нельзя — браузер его выбросит. Отправляем всем, а
    // проверяем на приёме, что сообщение пришло именно из нашего окна
    // (см. onMessage) — это и есть настоящая проверка, origin здесь ничего бы
    // не добавил. Секретов в этих сообщениях нет.
    const target = appOrigin === window.location.origin ? "*" : appOrigin;
    iframe.contentWindow.postMessage({ source: "shalter", v: BRIDGE_VERSION, ...message }, target);
  }

  function reply(id, ok, valueOrError) {
    if (!id) return;
    post({ type: "result", id, ok, ...(ok ? { value: valueOrError } : { error: String(valueOrError ?? "error") }) });
  }

  // Что страница вправе попросить у приложения. Каждый обработчик получает
  // payload и id запроса (если страница ждёт ответа).
  const HANDLERS = {
    // «Я загрузилась» — убирает индикатор, не дожидаясь картинок и шрифтов.
    ready: () => {
      loaded = true;
      renderState();
    },
    close: () => close(),
    // Данные боту. Уходят обычным сообщением от имени человека — он видит в
    // переписке, что именно отправило приложение (см. routes/bots.js).
    sendData: async ({ data }, id) => {
      try {
        const text = String(data ?? "");
        if (!text.trim()) throw new Error("Пустые данные");
        await api.sendBotAppData(botId, text);
        reply(id, true, { ok: true });
        // Как в Telegram: отправив данные, приложение свою работу закончило.
        close();
      } catch (err) {
        reply(id, false, err.message || "Не удалось отправить");
      }
    },
    // Внешняя ссылка уходит в настоящий браузер, а не подменяет собой
    // приложение: иначе окно с именем бота в шапке показывало бы чужой сайт.
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
    // Единственная защита, которая здесь работает: сообщение должно прийти
    // именно из нашего окна. Проверять только origin мало — на том же домене
    // может оказаться другой фрейм, а на "*" пишет кто угодно.
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
    // Сам iframe не пересоздаётся при перерисовке — перезагрузка страницы на
    // каждый чих сбрасывала бы то, что человек в приложении уже набрал.
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
    // Приложение, размещённое в самом Shalter (setWebAppCode), отдаётся с
    // нашего же адреса — и allow-same-origin означал бы, что чужой код внутри
    // считается «своим» для нашего домена: сессионная кука, наш /api, всё.
    // Поэтому здесь его нет, а сервер дублирует запрет заголовком (см.
    // routes/miniAppHost.js). Внешнему приложению он, наоборот, нужен: это его
    // собственный домен, его хранилище и его куки.
    const hosted = appOrigin === window.location.origin;
    iframe = el("iframe", {
      class: "mini-app-frame",
      src: fullUrl,
      // allow-modals — чтобы alert()/confirm() внутри приложения работали, а не
      // молчали, заставляя автора искать несуществующую ошибку.
      sandbox: hosted
        ? "allow-scripts allow-forms allow-popups allow-modals"
        : "allow-scripts allow-same-origin allow-forms allow-popups allow-modals",
      // Запасной путь: страница, не знающая про мост, никогда не пришлёт
      // ready — индикатор снимается по обычной загрузке.
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
