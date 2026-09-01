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
  // "method" is the new first step: an authenticator app is a real barrier —
  // it has to be installed and the QR has to be scannable — so the alternative
  // is a code the Shalter service bot posts into your own chat, exactly like the
  // login codes that already arrive there.
  let step = "method"; // "method" | "loading" | "scan" | "recovery" | "cloud" | "error"
  // Поля облачного пароля живут отдельно от `code`: там шесть цифр с фильтром,
  // здесь произвольный текст, и смешивать их в одной переменной значит чистить
  // чужой ввод чужими правилами.
  let cloudPassword = "";
  let cloudRepeat = "";
  let cloudHint = "";
  let accountPassword = "";
  let method = "totp";
  let resending = false;
  let secret = null;
  let otpauthUri = null;
  let recoveryCodes = [];
  let error = null;
  let busy = false;
  let code = "";
  let copied = false;
  // Focus is claimed at two moments only: when the scan step first appears, and
  // after a rejected code (so the next attempt can be typed straight away).
  // Grabbing it on *every* render fights whoever is typing — on a phone it
  // re-snaps the caret mid-entry — and never grabbing it means a wrong code
  // leaves focus on the button, so the keyboard goes nowhere. Both were real.
  let wantFocus = true;

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

  async function start(chosen) {
    method = chosen;
    step = "loading";
    render();
    try {
      const res = await api.setupTwoFactor(chosen);
      secret = res.secret ?? null;
      otpauthUri = res.otpauthUri ?? null;
      step = "scan";
      wantFocus = true;
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
      wantFocus = true;
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

  // Совпадение паролей проверяется здесь, а не на сервере: сервер видит один
  // пароль и о втором поле ничего не знает — это забота формы.
  async function saveCloudPassword() {
    error = null;
    if (cloudPassword.length < 6) error = "Облачный пароль — не короче 6 знаков";
    else if (cloudPassword !== cloudRepeat) error = "Пароли не совпадают";
    else if (!accountPassword) error = "Введите пароль от аккаунта";
    if (error) return render();

    busy = true;
    render();
    try {
      await api.setCloudPassword({ password: cloudPassword, hint: cloudHint, accountPassword });
      onEnabled?.();
      close();
    } catch (err) {
      error = err.message || "Не удалось включить";
      busy = false;
      render();
    }
  }

  function render() {
    clear(bodyEl);

    if (step === "method") {
      bodyEl.append(
        el("p", { class: "settings-toggle-hint" }, "Выберите, как подтверждать вход. Второй фактор можно будет сменить, отключив и включив защиту заново."),
        el("button", { class: "twofa-method-btn", onclick: () => start("chat") }, [
          el("span", { class: "twofa-method-title" }, "💬 Код в чате Shalter"),
          el("span", { class: "twofa-method-hint" }, "Код придёт сюда же, в служебный чат Shalter — как коды для входа. Ничего устанавливать не нужно."),
        ]),
        el("button", { class: "twofa-method-btn", onclick: () => start("totp") }, [
          el("span", { class: "twofa-method-title" }, "📱 Приложение-аутентификатор"),
          el("span", { class: "twofa-method-hint" }, "Google Authenticator, Aegis, 1Password. Надёжнее: код создаётся на вашем устройстве и не проходит через Shalter."),
        ]),
        el(
          "button",
          {
            class: "twofa-method-btn",
            onclick: () => {
              method = "password";
              step = "cloud";
              render();
            },
          },
          [
            el("span", { class: "twofa-method-title" }, "🔐 Облачный пароль"),
            el(
              "span",
              { class: "twofa-method-hint" },
              "Отдельный пароль, который спрашивают при входе после обычного. Ничего устанавливать и никуда ходить за кодом не нужно — но и восстановить его, если забыть, нельзя."
            ),
          ]
        ),
        el("button", { class: "modal-cancel", onclick: close }, "Отмена")
      );
      return;
    }

    if (step === "cloud") {
      const field = (label, value, opts, onInput) =>
        el("label", { class: "twofa-field" }, [
          el("span", { class: "settings-toggle-hint" }, label),
          el("input", { class: "login-input", value, ...opts, oninput: (e) => onInput(e.target.value) }),
        ]);
      bodyEl.append(
        el(
          "p",
          { class: "settings-toggle-hint" },
          "Этот пароль спросят при каждом входе с нового устройства — после обычного пароля. Забыть его нельзя: восстановления нет, поэтому придумайте подсказку."
        ),
        field("Облачный пароль", cloudPassword, { type: "password", autocomplete: "new-password", placeholder: "Не короче 6 знаков" }, (v) => (cloudPassword = v)),
        field("Ещё раз", cloudRepeat, { type: "password", autocomplete: "new-password" }, (v) => (cloudRepeat = v)),
        field("Подсказка (необязательно)", cloudHint, { type: "text", maxlength: 100, placeholder: "Её видно до входа" }, (v) => (cloudHint = v)),
        field("Пароль от аккаунта", accountPassword, { type: "password", autocomplete: "current-password", placeholder: "Чтобы это точно были вы" }, (v) => (accountPassword = v)),
        error ? el("p", { class: "login-error" }, error) : null,
        el("div", { class: "twofa-actions" }, [
          el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
          el("button", { class: "btn-accent", disabled: busy, onclick: saveCloudPassword }, busy ? "Сохраняем…" : "Включить"),
        ])
      );
      return;
    }

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
      // filter(Boolean) before append(): native Element.append() turns a null
      // argument into a literal "null" text node, so the two conditional lines
      // below printed the word "null" above and under the code field. It made
      // the step look broken, which is exactly how it was reported.
      const totpSteps =
        method === "totp"
          ? [
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
            ]
          : [
              el("p", { class: "settings-toggle-hint" }, "Код отправлен в ваш чат с Shalter — откройте его и введите шесть цифр. Код действует 5 минут."),
              el(
                "button",
                {
                  class: "profile-action-btn",
                  disabled: resending,
                  onclick: async () => {
                    resending = true;
                    error = null;
                    render();
                    try {
                      await api.sendTwoFactorCode();
                    } catch (err) {
                      error = err.message || "Не удалось отправить код";
                    }
                    resending = false;
                    wantFocus = true;
                    render();
                  },
                },
                resending ? "Отправляем…" : "Отправить код ещё раз"
              ),
            ];
      bodyEl.append(
        ...[
        ...totpSteps,
        codeInput,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: confirm }, busy ? "Проверяем…" : "Включить"),
        el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
        ].filter(Boolean)
      );
      codeInput.value = code;
      // Focused once, when the step first appears — not on every render. Calling
      // focus() repeatedly fights the person using the field: on a phone it
      // re-snaps the caret and can dismiss the keyboard mid-entry.
      if (wantFocus) {
        wantFocus = false;
        codeInput.focus();
        // The rejected code is selected rather than cleared: retyping replaces
        // it, and it stays readable in case it was the right code entered a
        // second too late.
        codeInput.select();
      }
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
