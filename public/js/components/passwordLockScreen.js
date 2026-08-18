import { el, mount } from "../lib/dom.js";
import { api } from "../api.js";

// Замок при запуске: пароль аккаунта спрашивается даже при уже выполненном
// входе. Отличие от код-пароля (lib/passcodeLock.js) в том, от чего защищает:
// код-пароль — местная выдумка этого устройства, а здесь настоящий пароль
// аккаунта, проверяемый сервером. Пока он не введён, приложение не рисуется
// вообще — не «поверх», чтобы под накладкой ничего нельзя было подсмотреть.
export function showPasswordLockScreen(root) {
  return new Promise((resolve) => {
    let busy = false;
    let error = null;
    const input = el("input", { class: "login-input", type: "password", placeholder: "Пароль", autofocus: true });

    async function submit() {
      if (busy || !input.value) return;
      busy = true;
      error = null;
      render();
      try {
        await api.verifyPassword(input.value);
        resolve();
      } catch (err) {
        error = err.message || "Неверный пароль";
        busy = false;
        input.value = "";
        render();
        input.focus();
      }
    }
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());

    function render() {
      mount(
        root,
        el("div", { class: "passcode-lock-screen" }, [
          el("div", { class: "passcode-lock-card" }, [
            el("p", { class: "passcode-lock-title" }, "Введите пароль"),
            el("p", { class: "passcode-lock-hint" }, "Приложение защищено паролем от аккаунта"),
            input,
            error ? el("p", { class: "login-error" }, error) : null,
            el("button", { class: "btn-accent", disabled: busy, onclick: submit }, busy ? "Проверяем…" : "Войти"),
          ]),
        ])
      );
    }
    render();
    setTimeout(() => input.focus(), 50);
  });
}
