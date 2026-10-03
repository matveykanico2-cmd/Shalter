import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import qrcode from "../lib/qrcode.js";
import { onWsMessage } from "../lib/wsClient.js";

export function openTwoFactorSetupDialog(onEnabled) {
  let step = "method";
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
  let wantFocus = true;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "twofa-body" });
  const dialog = el("div", { class: "modal-dialog twofa-dialog" }, [
    el("h2", { class: "modal-title" }, "Двухфакторная аутентификация"),
    bodyEl,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Код из чата с Shalter подставляется сам — не нужно уходить из настройки в чат.
  const stopCodeWatch = onWsMessage("message:new", ({ message }) => {
    if (method !== "chat" || step !== "scan" || message?.senderId !== "bot_shalter") return;
    const found = String(message.text ?? "").match(/Код подтверждения:\s*(\d{6})/);
    if (!found) return;
    code = found[1];
    codeInput.value = code;
    if (!busy) confirm();
  });

  function close() {
    stopCodeWatch?.();
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

  const codeInput = el("input", {
    class: "login-input login-code-input mono",
    inputmode: "numeric",
    placeholder: "······",
    maxlength: 20,
    autocomplete: "one-time-code",
    oninput: (e) => {
      if (method === "chat") {
        e.target.value = e.target.value.replace(/[^\d+]/g, "").slice(0, 20);
      } else {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
      }
      code = e.target.value;
    },
  });

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
      appendAll(bodyEl,
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
      appendAll(bodyEl,
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
      appendAll(bodyEl, el("div", { class: "qr-login-spinner" }));
      return;
    }

    if (step === "error") {
      appendAll(bodyEl,
        el("p", { class: "login-error" }, error),
        el("button", { class: "modal-cancel", onclick: close }, "Закрыть")
      );
      return;
    }

    if (step === "scan") {
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
              el("p", { class: "settings-toggle-hint" }, "Код отправлен в ваш чат с Shalter и придёт уведомлением. Если приложение открыто, код подставится сам. Код действует 5 минут."),
              el("p", { class: "settings-toggle-hint" }, "Не видите код? Введите в поле номер телефона этого аккаунта — этого достаточно, чтобы включить."),
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
      appendAll(bodyEl,
        ...[
        ...totpSteps,
        codeInput,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: confirm }, busy ? "Проверяем…" : "Включить"),
        el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
        ].filter(Boolean)
      );
      codeInput.value = code;
      if (wantFocus) {
        wantFocus = false;
        codeInput.focus();
        codeInput.select();
      }
      return;
    }

    appendAll(bodyEl,
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
          }
        },
      }, copied ? "Скопировано ✓" : "Скопировать все коды"),
      el("button", { class: "btn-accent", onclick: close }, "Я сохранил коды")
    );
  }

  render();
}

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
