import { el } from "../lib/dom.js";
import { verifyPasscode } from "../lib/passcodeLock.js";
import { hasBiometric, unlockBiometric } from "../lib/biometricLock.js";

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
    if (biometric) tryBiometric();
  });
}
