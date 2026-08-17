/*
 * Shalter Mini Apps SDK — window.Shalter.WebApp
 *
 * Подключается страницей бота одной строкой:
 *   <script src="https://<ваш-shalter>/js/shalter-web-app.js"></script>
 *
 * Это НЕ модуль приложения: файл отдаётся чужим сайтам как есть (сборка
 * scripts/build.js собирает только js/app.js и до него не доходит), поэтому
 * здесь обычный скрипт без import/export и без синтаксиса новее, чем понимает
 * любой браузер, куда вообще откроют мини-приложение.
 *
 * Документация: /bots#apps
 */
(function () {
  "use strict";

  var BRIDGE_VERSION = 1;

  // Подпись открывшего лежит во фрагменте адреса — она не уходит на сервер
  // приложения в строке запроса и не оседает в его логах (см.
  // server/lib/miniApp.js). Забираем и сразу отдаём автору как есть: проверять
  // подпись должен бот на своём сервере, ключом от своего токена.
  function readFragment() {
    var raw = String(window.location.hash || "").replace(/^#/, "");
    var params = new URLSearchParams(raw);
    return { initData: params.get("shalterWebApp") || "", theme: params.get("shalterTheme") || "light" };
  }

  var fragment = readFragment();

  function parseUser(initData) {
    try {
      var value = new URLSearchParams(initData).get("user");
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  }

  var pending = {};
  var nextId = 1;
  var listeners = {};
  var isOpenedInShalter = window.parent !== window && !!fragment.initData;

  function call(method, payload, wantsAnswer) {
    if (!isOpenedInShalter) {
      // Страницу открыли просто в браузере — так её и отлаживают. Молчаливое
      // ничего здесь хуже отказа: автор полчаса ищет, почему не работает
      // кнопка, которой некому ответить.
      var message = "Shalter.WebApp." + method + "(): страница открыта не внутри Shalter";
      if (wantsAnswer) return Promise.reject(new Error(message));
      console.warn(message);
      return undefined;
    }
    var msg = { source: "shalter-web-app", v: BRIDGE_VERSION, method: method, payload: payload || {} };
    if (!wantsAnswer) {
      window.parent.postMessage(msg, "*");
      return undefined;
    }
    var id = String(nextId++);
    msg.id = id;
    var promise = new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
    });
    window.parent.postMessage(msg, "*");
    return promise;
  }

  window.addEventListener("message", function (e) {
    var msg = e.data;
    if (!msg || msg.source !== "shalter") return;
    if (msg.type === "result" && pending[msg.id]) {
      var entry = pending[msg.id];
      delete pending[msg.id];
      if (msg.ok) entry.resolve(msg.value);
      else entry.reject(new Error(msg.error || "error"));
      return;
    }
    if (msg.type === "event") {
      (listeners[msg.event] || []).forEach(function (fn) {
        try {
          fn(msg.payload);
        } catch (err) {
          console.error(err);
        }
      });
    }
  });

  // Нижняя кнопка рисуется самим Shalter, а не страницей: на телефоне она
  // должна стоять на месте и не уезжать с прокруткой содержимого.
  var mainButtonState = { text: "", visible: false, disabled: false, loading: false };
  function pushMainButton() {
    call("mainButton", mainButtonState, false);
    return MainButton;
  }
  var MainButton = {
    get text() {
      return mainButtonState.text;
    },
    get isVisible() {
      return mainButtonState.visible;
    },
    setText: function (text) {
      mainButtonState.text = String(text == null ? "" : text);
      return pushMainButton();
    },
    show: function () {
      mainButtonState.visible = true;
      return pushMainButton();
    },
    hide: function () {
      mainButtonState.visible = false;
      return pushMainButton();
    },
    enable: function () {
      mainButtonState.disabled = false;
      return pushMainButton();
    },
    disable: function () {
      mainButtonState.disabled = true;
      return pushMainButton();
    },
    showProgress: function () {
      mainButtonState.loading = true;
      return pushMainButton();
    },
    hideProgress: function () {
      mainButtonState.loading = false;
      return pushMainButton();
    },
    onClick: function (fn) {
      return WebApp.onEvent("mainButtonClicked", fn);
    },
  };

  var WebApp = {
    version: BRIDGE_VERSION,
    // Строка с подписью — её и надо переслать боту, чтобы он проверил, кто
    // перед ним. Целиком, не по кусочкам: подпись считается от всей строки.
    initData: fragment.initData,
    // Разобранное содержимое — удобно для интерфейса и НЕ годится для доверия:
    // это то же самое, что прислал бы кто угодно, пока подпись не проверена.
    initDataUnsafe: { user: parseUser(fragment.initData) },
    get user() {
      return WebApp.initDataUnsafe.user;
    },
    colorScheme: fragment.theme === "dark" ? "dark" : "light",
    isOpenedInShalter: isOpenedInShalter,
    MainButton: MainButton,

    ready: function () {
      call("ready", {}, false);
    },
    close: function () {
      call("close", {}, false);
    },
    // Отправить данные боту. Уходит обычным сообщением от имени человека —
    // он видит в переписке, что именно отправило приложение, — после чего окно
    // закрывается. Отличие от Telegram, где такое сообщение видит только бот.
    sendData: function (data) {
      var text = typeof data === "string" ? data : JSON.stringify(data);
      return call("sendData", { data: text }, true);
    },
    openLink: function (url) {
      return call("openLink", { url: String(url) }, true);
    },
    showAlert: function (message) {
      return call("showAlert", { message: String(message) }, true);
    },
    showConfirm: function (message) {
      return call("showConfirm", { message: String(message) }, true).then(function (r) {
        return !!(r && r.confirmed);
      });
    },
    onEvent: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return function off() {
        listeners[event] = (listeners[event] || []).filter(function (x) {
          return x !== fn;
        });
      };
    },
  };

  window.Shalter = window.Shalter || {};
  window.Shalter.WebApp = WebApp;
})();
