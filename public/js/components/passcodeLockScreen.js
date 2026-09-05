import { el } from "../lib/dom.js";
import { verifyPasscode } from "../lib/passcodeLock.js";
import { hasBiometric, unlockBiometric } from "../lib/biometricLock.js";

// Full-page takeover appended straight to <body> — both on initial boot
// (before the app shell exists at all, see app.js) and again every time the
// tab comes back from being hidden, if a local passcode is set. It sits on
// top of, not instead of, whatever's already rendered underneath, so nothing
// needs to be re-mounted once it's dismissed — it just removes itself.
//
// Если включена биометрия (Face ID / отпечаток, см. lib/biometricLock.js),
// экран сразу предлагает её и пробует снять замок автоматически; код-пароль
// остаётся запасным способом — биометрию нельзя включить, не задав его, ровно
// чтобы отказ сканера не запирал человека снаружи.
export function showPasscodeLockScreen() {
  return new Promise((resolve) => {
    let code = "";
    let error = null;
    let checking = false;
    const biometric = hasBiometric();
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

    async function tryBiometric() {
      error = null;
      checking = true;
      render();
      const ok = await unlockBiometric();
      if (ok) {
        overlay.remove();
        resolve();
        return;
      }
      checking = false;
      error = "Не удалось подтвердить — введите код-пароль";
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
          biometric
            ? el("button", { class: "passcode-lock-biometric", disabled: checking, onclick: tryBiometric }, "🔓 Face ID / отпечаток")
            : null,
        ])
      );
      input.focus();
    }

    render();
    document.body.appendChild(overlay);
    // Сразу вызвать системный запрос биометрии, не заставляя тянуться к кнопке.
    if (biometric) tryBiometric();
  });
}
