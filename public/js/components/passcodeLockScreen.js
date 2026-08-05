import { el } from "../lib/dom.js";
import { verifyPasscode } from "../lib/passcodeLock.js";

// Full-page takeover appended straight to <body> — both on initial boot
// (before the app shell exists at all, see app.js) and again every time the
// tab comes back from being hidden, if a local passcode is set. It sits on
// top of, not instead of, whatever's already rendered underneath, so nothing
// needs to be re-mounted once it's dismissed — it just removes itself.
export function showPasscodeLockScreen() {
  return new Promise((resolve) => {
    let code = "";
    let error = null;
    let checking = false;
    const overlay = el("div", { class: "passcode-lock-screen" });

    async function submit() {
      error = null;
      checking = true;
      render();
      const ok = await verifyPasscode(code);
      if (ok) {
        overlay.remove();
        resolve();
        return;
      }
      error = "Неверный код-пароль";
      code = "";
      checking = false;
      render();
    }

    function render() {
      const input = el("input", {
        class: "login-input passcode-lock-input",
        type: "password",
        inputmode: "numeric",
        placeholder: "Код-пароль",
        autofocus: true,
        value: code,
        oninput: (e) => (code = e.target.value),
        onkeydown: (e) => e.key === "Enter" && submit(),
      });
      overlay.textContent = "";
      overlay.append(
        el("div", { class: "passcode-lock-card" }, [
          el("span", { class: "passcode-lock-icon", html: "🔒" }),
          el("p", { class: "passcode-lock-title" }, "Shalter заблокирован"),
          input,
          error ? el("p", { class: "login-error" }, error) : null,
          el("button", { class: "btn-accent", disabled: checking, onclick: submit }, checking ? "Проверяем…" : "Разблокировать"),
        ])
      );
      input.focus();
    }

    render();
    document.body.appendChild(overlay);
  });
}
