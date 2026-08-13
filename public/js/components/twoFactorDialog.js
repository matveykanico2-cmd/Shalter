import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import qrcode from "../lib/qrcode.js";

// Turning on two-factor authentication (server/lib/totp.js). Three steps in one
// dialog: scan, confirm with a real code, then write down the recovery codes.
//
// The confirm step is not optional politeness — the secret is stored the moment
// the QR is generated, so without proving that an authenticator app actually
// holds it, closing this dialog halfway could leave an account demanding a code
// nobody can produce. That's why the server keeps 2FA "off" until /2fa/enable
// succeeds (see the totpEnabledAt column).
//
// The QR is drawn with the same vendored generator as QR login
// (public/js/lib/qrcode.js), so the secret is rendered locally and never goes
// near a third-party chart service.
export function openTwoFactorSetupDialog(onEnabled) {
  let step = "loading"; // "loading" | "scan" | "recovery" | "error"
  let secret = null;
  let otpauthUri = null;
  let recoveryCodes = [];
  let error = null;
  let busy = false;
  let code = "";
  let copied = false;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "twofa-body" });
  const dialog = el("div", { class: "modal-dialog twofa-dialog" }, [
    el("h2", { class: "modal-title" }, "Двухфакторная аутентификация"),
    bodyEl,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  function qrSvg(text) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 10, scalable: true });
  }

  async function start() {
    try {
      const res = await api.setupTwoFactor();
      secret = res.secret;
      otpauthUri = res.otpauthUri;
      step = "scan";
    } catch (err) {
      error = err.message || "Не удалось начать настройку";
      step = "error";
    }
    render();
  }

  async function confirm() {
    if (busy) return;
    busy = true;
    error = null;
    render();
    try {
      const res = await api.enableTwoFactor(code);
      recoveryCodes = res.recoveryCodes ?? [];
      step = "recovery";
      onEnabled?.();
    } catch (err) {
      error = err.message || "Неверный код";
    } finally {
      busy = false;
      render();
    }
  }

  // The code field is built once and kept across renders — rebuilding it on
  // every keystroke would take the focus with it (the same bug the contacts
  // search and the login code field had).
  const codeInput = el("input", {
    class: "login-input login-code-input mono",
    inputmode: "numeric",
    placeholder: "······",
    maxlength: 6,
    autocomplete: "one-time-code",
    oninput: (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
      code = e.target.value;
    },
  });

  function render() {
    clear(bodyEl);

    if (step === "loading") {
      bodyEl.append(el("div", { class: "qr-login-spinner" }));
      return;
    }

    if (step === "error") {
      bodyEl.append(
        el("p", { class: "login-error" }, error),
        el("button", { class: "modal-cancel", onclick: close }, "Закрыть")
      );
      return;
    }

    if (step === "scan") {
      bodyEl.append(
        el("p", { class: "settings-toggle-hint" }, "Отсканируйте код в приложении-аутентификаторе (Google Authenticator, Aegis, 1Password, Bitwarden) и введите шестизначный код из него."),
        el("div", { class: "twofa-qr", html: qrSvg(otpauthUri) }),
        el("p", { class: "settings-toggle-hint" }, "Не получается отсканировать? Введите ключ вручную:"),
        el("div", { class: "donation-code-row" }, [
          el("span", { class: "mono twofa-secret" }, secret),
          el("button", {
            class: "icon-btn",
            title: "Скопировать ключ",
            html: iconSvg("Copy", 16),
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(secret);
                copied = true;
              } catch {
                copied = false;
              }
              render();
            },
          }),
        ]),
        copied ? el("p", { class: "settings-toggle-hint" }, "Ключ скопирован ✓") : null,
        codeInput,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: confirm }, busy ? "Проверяем…" : "Включить"),
        el("button", { class: "modal-cancel", onclick: close }, "Отмена")
      );
      codeInput.value = code;
      codeInput.focus();
      return;
    }

    // step === "recovery"
    bodyEl.append(
      el("p", { class: "twofa-enabled-note" }, "✅ Двухфакторная аутентификация включена"),
      el(
        "p",
        { class: "settings-toggle-hint" },
        "Сохраните коды восстановления — каждый работает один раз и понадобится, если вы потеряете доступ к аутентификатору. Больше они не покажутся."
      ),
      el("div", { class: "twofa-recovery-grid" }, recoveryCodes.map((c) => el("span", { class: "mono twofa-recovery-code" }, c))),
      el("button", {
        class: "profile-action-btn",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(recoveryCodes.join("\n"));
            copied = true;
            render();
          } catch {
            /* clipboard blocked — the codes are on screen to copy by hand */
          }
        },
      }, copied ? "Скопировано ✓" : "Скопировать все коды"),
      el("button", { class: "btn-accent", onclick: close }, "Я сохранил коды")
    );
  }

  render();
  start();
}

// Turning it off needs a current code (or a recovery code) — see the /2fa/disable
// route for why: an open session alone must not be enough to strip the
// protection, or 2FA guards nothing once someone is already in.
export function openTwoFactorDisableDialog(onDisabled) {
  let busy = false;
  let error = null;
  let code = "";

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const errorSlot = el("p", { class: "login-error" });
  const codeInput = el("input", {
    class: "login-input login-code-input mono",
    placeholder: "······",
    autofocus: true,
    autocomplete: "one-time-code",
    oninput: (e) => (code = e.target.value.trim()),
  });
  const submitBtn = el("button", { class: "btn-accent danger" }, "Отключить");

  submitBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    submitBtn.disabled = true;
    errorSlot.textContent = "";
    try {
      await api.disableTwoFactor(code);
      onDisabled?.();
      close();
    } catch (err) {
      error = err.message || "Неверный код";
      errorSlot.textContent = error;
      busy = false;
      submitBtn.disabled = false;
    }
  });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Отключить двухфакторную аутентификацию?"),
    el("p", { class: "settings-toggle-hint" }, "Введите текущий код из аутентификатора или код восстановления."),
    codeInput,
    errorSlot,
    submitBtn,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
