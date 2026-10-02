(function () {
  "use strict";

  var BRIDGE_VERSION = 1;

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
    initData: fragment.initData,
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
