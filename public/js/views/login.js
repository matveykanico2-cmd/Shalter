import { askConfirm } from "../components/confirmDialog.js";
import { el, mount } from "../lib/dom.js";
import { isInstalledApp } from "../lib/platform.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { passkeysSupported, loginWithPasskey, passkeyErrorText } from "../lib/passkey.js";
import { navigate } from "../router.js";
import { fileToAvatarDataUrl } from "../lib/image.js";
import { prettyQrSvg } from "../lib/prettyQr.js";
import { PhoneField } from "../components/phoneField.js";

const QR_POLL_MS = 1500;

export function LoginView(root, { addMode, onSuccess, embedded } = {}) {
  const revokedNotice = new URLSearchParams(window.location.search).get("reason") === "revoked";
  const bannedNotice = new URLSearchParams(window.location.search).get("reason") === "banned";
  const bannedWhy = new URLSearchParams(window.location.search).get("why");
  let mode = "login";
  let name = "";
  let lastName = "";
  let email = "";
  let password = "";
  let phone = "";
  let username = "";
  let avatarImage = null;
  let error = null;
  let pending = false;

  let qrToken = null;
  let qrLoginUrl = null;
  let qrStatus = "loading";
  let qrPollTimer = null;

  let codePhone = "";
  let codeValue = "";
  let codeStep = "phone";
  let codeError = null;
  let codePending = false;

  let codePhoneField = null;
  let registerPhoneField = null;
  let twoFactor = null;
  let recoverStep = "email";
  let recoverPhone = "";
  let recoverPhoneField = null;
  let recoverEmail = "";
  let recoverPassword = "";
  let recoverError = null;
  let recoverPending = false;
  let twoFactorCode = "";
  let twoFactorError = null;
  let twoFactorPending = false;

  function stopQrPolling() {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }

  async function startQrLogin() {
    stopQrPolling();
    qrStatus = "loading";
    render();
    try {
      const res = await api.startQrLogin();
      qrToken = res.token;
      qrLoginUrl = res.loginUrl;
      qrStatus = "ready";
      render();
      qrPollTimer = setInterval(async () => {
        try {
          const poll = await api.pollQrLogin(qrToken);
          if (poll.status === "confirmed") {
            stopQrPolling();
            (onSuccess ?? goToApp)(poll.user);
          } else if (poll.status === "banned") {
            stopQrPolling();
            mode = "login";
            error = poll.error || "Аккаунт заблокирован администрацией Shalter";
            render();
          } else if (poll.status === "expired") {
            startQrLogin();
          }
        } catch {
        }
      }, QR_POLL_MS);
    } catch {
      qrStatus = "error";
      render();
    }
  }

  function avatarPicker() {
    const preview = el("div", { class: "create-chat-avatar-preview" }, [el("span", { html: iconSvg("Users", 22) })]);
    if (avatarImage) {
      preview.textContent = "";
      preview.appendChild(el("img", { src: avatarImage, class: "create-chat-avatar-img" }));
    }
    const input = el("input", {
      type: "file",
      accept: "image/*",
      class: "hidden-input",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        avatarImage = await fileToAvatarDataUrl(file);
        render();
      },
    });
    return el("button", { type: "button", class: "create-chat-avatar-btn", onclick: () => input.click() }, [
      preview,
      input,
      el("span", { class: "create-chat-avatar-label" }, "Фото профиля (необязательно)"),
    ]);
  }

  function goToApp() {
    window.location.href = "/";
  }

  function finishAuth(user, _alreadyLinked) {
    (onSuccess ?? goToApp)(user);
  }

  function qrCodeSvg(text) {
    return prettyQrSvg(text);
  }

  function renderQrPanel() {
    let body;
    if (qrStatus === "ready") {
      body = [
        el("div", { class: "qr-login-code", html: qrCodeSvg(qrLoginUrl) }),
        el("p", { class: "qr-login-instructions" }, [
          "Откройте камеру на телефоне и наведите на код — откроется страница подтверждения. ",
          "Если вы уже вошли в Shalter на телефоне, останется просто нажать «Подтвердить».",
        ]),
      ];
    } else if (qrStatus === "error") {
      body = [
        el("p", { class: "login-error center" }, "Не удалось получить код"),
        el("button", { type: "button", class: "login-submit", onclick: startQrLogin }, "Попробовать снова"),
      ];
    } else {
      body = [el("div", { class: "qr-login-spinner" })];
    }

    return el("div", { class: "qr-login-panel" }, [
      el("p", { class: "qr-login-title" }, "Вход по QR-коду"),
      ...body,
      el(
        "button",
        {
          type: "button",
          class: "login-link",
          onclick: () => {
            stopQrPolling();
            mode = "login";
            error = null;
            render();
          },
        },
        "Войти по email"
      ),
    ]);
  }

  function renderTwoFactorPanel() {
    const byPassword = twoFactor.method === "password";
    const codeInput = el("input", {
      class: byPassword ? "login-input" : "login-input login-code-input mono",
      type: byPassword ? "password" : "text",
      inputmode: "text",
      placeholder: byPassword ? "Облачный пароль" : "······",
      autofocus: true,
      autocomplete: byPassword ? "current-password" : "one-time-code",
      oninput: (e) => (twoFactorCode = byPassword ? e.target.value : e.target.value.trim()),
    });

    const form = el(
      "form",
      {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          twoFactorError = null;
          twoFactorPending = true;
          render();
          try {
            const res = await api.twoFactorLogin(twoFactor.ticket, twoFactorCode);
            finishAuth(res.user, res.alreadyLinked);
          } catch (err) {
            twoFactorError = err.message;
            twoFactorCode = "";
            twoFactorPending = false;
            render();
          }
        },
      },
      [
        codeInput,
        el(
          "p",
          { class: "login-hint" },
          byPassword
            ? twoFactor.hint
              ? `Подсказка: ${twoFactor.hint}`
              : "Это отдельный пароль, который вы задали в настройках безопасности. Он не совпадает с паролем от аккаунта."
            : twoFactor.method === "chat"
              ? "Код отправлен в ваш чат с Shalter — откройте его на устройстве, где вы уже вошли. Можно ввести и код восстановления."
              : "Код из приложения-аутентификатора. Можно ввести и код восстановления."
        ),
        twoFactor.method === "chat"
          ? el(
              "button",
              {
                type: "button",
                class: "login-link",
                onclick: async () => {
                  twoFactorError = null;
                  try {
                    await api.sendTwoFactorCode(twoFactor.ticket);
                    twoFactorError = "Новый код отправлен в чат Shalter";
                  } catch (err) {
                    twoFactorError = err.message || "Не удалось отправить код";
                  }
                  render();
                },
              },
              "Отправить код ещё раз"
            )
          : null,
        twoFactorError ? el("p", { class: "login-error center" }, twoFactorError) : null,
        el("button", { class: "login-submit", disabled: twoFactorPending }, twoFactorPending ? "Проверяем…" : "Подтвердить вход"),
      ].filter(Boolean)
    );

    return el("div", { class: "qr-login-panel" }, [
      el("p", { class: "qr-login-title" }, byPassword ? "Облачный пароль" : "Двухфакторная аутентификация"),
      el(
        "p",
        { class: "qr-login-instructions" },
        byPassword
          ? `Вход в аккаунт${twoFactor.name ? ` ${twoFactor.name}` : ""} защищён облачным паролем — введите его.`
          : `Вход в аккаунт${twoFactor.name ? ` ${twoFactor.name}` : ""} защищён вторым фактором — введите текущий код.`
      ),
      form,
      el(
        "button",
        {
          type: "button",
          class: "login-link",
          onclick: () => {
            twoFactor = null;
            twoFactorCode = "";
            twoFactorError = null;
            mode = "login";
            render();
          },
        },
        "Отмена"
      ),
      twoFactor.scheduledDeletionAt
        ? el(
            "button",
            {
              type: "button",
              class: "login-link center",
              onclick: async () => {
                try {
                  await api.cancelAccountDeletion(twoFactor.ticket);
                  twoFactor = { ...twoFactor, scheduledDeletionAt: null };
                  error = "Удаление аккаунта отменено.";
                  render();
                } catch (err) {
                  twoFactorError = err.message || "Не удалось отменить удаление";
                  render();
                }
              },
            },
            "Отменить удаление аккаунта"
          )
        : null,
      el(
        "button",
        {
          type: "button",
          class: "login-link center",
          onclick: async () => {
            if (!(await askConfirm("Не помните облачный пароль и не можете войти?\n\nМожно запросить удаление аккаунта — он будет удалён через 7 дней. Если вспомните пароль и войдёте до этого, удаление отменится.\n\nЗапросить удаление?"))) return;
            try {
              const { deleteAt } = await api.scheduleAccountDeletion(twoFactor.ticket);
              const when = new Date(deleteAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
              twoFactor = null;
              twoFactorCode = "";
              twoFactorError = null;
              mode = "login";
              error = `Аккаунт будет удалён ${when}. Войдите до этой даты, чтобы отменить.`;
              render();
            } catch (err) {
              twoFactorError = err.message || "Не удалось запросить удаление";
              render();
            }
          },
        },
        "Не помню облачный пароль — удалить аккаунт"
      ),
    ].filter(Boolean));
  }

  function renderRecoverPanel() {
    recoverPhoneField ??= PhoneField({ onChange: (v) => (recoverPhone = v) });

    const emailInput = el("input", {
      class: "login-input",
      type: "email",
      placeholder: "you@example.com",
      value: recoverEmail,
      autofocus: recoverStep === "email",
      oninput: (e) => (recoverEmail = e.target.value),
    });
    const passInput = el("input", {
      class: "login-input",
      type: "password",
      placeholder: "Новый пароль",
      value: recoverPassword,
      oninput: (e) => (recoverPassword = e.target.value),
    });

    const form = el(
      "form",
      {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          recoverError = null;
          recoverPending = true;
          render();
          try {
            if (recoverStep === "email") {
              await api.checkRecoveryPair(recoverEmail.trim(), recoverPhone);
              recoverStep = "code";
              recoverPending = false;
              render();
              return;
            }
            const { user } = await api.finishPairRecovery(recoverEmail.trim(), recoverPhone, recoverPassword);
            (onSuccess ?? goToApp)(user);
          } catch (err) {
            recoverError = err.message;
            recoverPending = false;
            render();
          }
        },
      },
      (recoverStep === "email"
        ? [
            emailInput,
            recoverPhoneField.el,
            el("p", { class: "login-hint" }, "Адрес почты и номер телефона — оба как указаны в аккаунте. Кода не будет: сразу зададите новый пароль."),
          ]
        : [
            passInput,
            el("p", { class: "login-hint" }, "Все остальные сеансы будут завершены, а владельцу уйдёт уведомление в чат и на почту."),
          ]
      ).concat(
        [
          recoverError ? el("p", { class: "login-error center" }, recoverError) : null,
          el(
            "button",
            { class: "login-submit", disabled: recoverPending },
            recoverPending ? "Секунду…" : recoverStep === "email" ? "Далее" : "Задать новый пароль"
          ),
        ].filter(Boolean)
      )
    );

    return el("div", { class: "qr-login-panel" }, [
      el("p", { class: "qr-login-title" }, "Забыли пароль?"),
      el(
        "p",
        { class: "qr-login-instructions" },
        recoverStep === "email"
          ? "Введите адрес почты и номер телефона этого аккаунта."
          : "Почта и телефон совпали. Придумайте новый пароль."
      ),
      form,
      recoverStep === "code"
        ? el(
            "button",
            {
              type: "button",
              class: "login-link",
              onclick: () => {
                recoverStep = "email";
                recoverError = null;
                render();
              },
            },
            "Изменить данные"
          )
        : null,
      el(
        "button",
        {
          type: "button",
          class: "login-link",
          onclick: () => {
            mode = "login";
            recoverStep = "email";
            recoverError = null;
            render();
          },
        },
        "Назад ко входу"
      ),
    ].filter(Boolean));
  }

  function renderCodePanel() {
    const form = el(
      "form",
      {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          codeError = null;
          codePending = true;
          render();
          try {
            if (codeStep === "phone") {
              await api.startCodeLogin(codePhone);
              codeStep = "code";
            } else {
              const res = await api.verifyCodeLogin(codePhone, codeValue);
              if (res.twoFactorRequired) {
                twoFactor = { ticket: res.ticket, name: res.name, method: res.method ?? "totp", hint: res.hint ?? null, scheduledDeletionAt: res.scheduledDeletionAt ?? null };
                codePending = false;
                render();
                return;
              }
              finishAuth(res.user, res.alreadyLinked);
            }
          } catch (err) {
            codeError = err.message;
          } finally {
            codePending = false;
            render();
          }
        },
      },
      codeStep === "phone"
        ? [
            (codePhoneField ??= PhoneField({
              value: codePhone,
              autofocus: true,
              onChange: (v) => (codePhone = v),
            })).el,
            el(
              "p",
              { class: "login-hint" },
              "Код придёт сообщением от Shalter на другое устройство, где вы уже вошли в этот аккаунт."
            ),
            codeError ? el("p", { class: "login-error center" }, codeError) : null,
            el("button", { class: "login-submit", disabled: codePending }, codePending ? "Отправляем…" : "Отправить код"),
          ]
        : [
            el("input", {
              class: "login-input login-code-input mono",
              inputmode: "numeric",
              placeholder: "······",
              maxlength: 6,
              autofocus: true,
              value: codeValue,
              oninput: (e) => (codeValue = e.target.value.replace(/\D/g, "").slice(0, 6)),
            }),
            el("p", { class: "login-hint" }, `Код отправлен в чат Shalter для номера ${codePhone}.`),
            codeError ? el("p", { class: "login-error center" }, codeError) : null,
            el("button", { class: "login-submit", disabled: codePending }, codePending ? "Проверяем…" : "Войти"),
          ]
    );

    return el("div", { class: "qr-login-panel" }, [
      el("p", { class: "qr-login-title" }, "Вход по коду"),
      form,
      el(
        "button",
        {
          type: "button",
          class: "login-link",
          onclick: () => {
            mode = "login";
            codeStep = "phone";
            codeError = null;
            render();
          },
        },
        "Войти по email"
      ),
    ]);
  }

  const usernameStatus = el("p", { class: "login-hint username-status" });
  let usernameCheckTimer = null;
  let usernameCheckSeq = 0;
  const usernameEl = el("input", {
    class: "login-input mono",
    placeholder: "юзернейм",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
    autocomplete: "username",
    oninput: (e) => {
      const cleaned = e.target.value.replace(/^@+/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 32);
      if (cleaned !== e.target.value) {
        const caret = e.target.selectionStart - (e.target.value.length - cleaned.length);
        e.target.value = cleaned;
        e.target.setSelectionRange(Math.max(0, caret), Math.max(0, caret));
      }
      username = cleaned;
      clearTimeout(usernameCheckTimer);
      if (username.length < 3) {
        setUsernameStatus(username.length === 0 ? "" : "Минимум 3 символа", "");
        return;
      }
      setUsernameStatus("Проверяем…", "");
      usernameCheckTimer = setTimeout(checkUsername, 400);
    },
  });

  function setUsernameStatus(text, kind) {
    usernameStatus.textContent = text;
    usernameStatus.className = `login-hint username-status ${kind}`;
  }

  async function checkUsername() {
    const seq = ++usernameCheckSeq;
    const asked = username;
    try {
      const res = await api.checkUsername(asked);
      if (seq !== usernameCheckSeq || asked !== username) return;
      setUsernameStatus(res.available ? "Свободен ✓" : res.error || "Занят", res.available ? "ok" : "taken");
    } catch {
      if (seq !== usernameCheckSeq) return;
      setUsernameStatus("Не удалось проверить — попробуем при регистрации", "");
    }
  }

  function usernameField() {
    usernameEl.value = username;
    return el("div", { class: "login-username-field" }, [
      usernameEl,
      usernameStatus.textContent ? usernameStatus : el("p", { class: "login-hint" }, "По нему вас смогут найти и добавить — латиница, цифры и _"),
    ]);
  }

  function render() {
    const subtitle = mode === "login" ? "Рады видеть вас снова" : "Быстро, красиво и по-настоящему безопасно";

    const nameInput =
      mode === "register"
        ? el("input", { class: "login-input", placeholder: "Имя", value: name, oninput: (e) => (name = e.target.value) })
        : null;
    const lastNameInput =
      mode === "register"
        ? el("input", { class: "login-input", placeholder: "Фамилия (необязательно)", value: lastName, oninput: (e) => (lastName = e.target.value) })
        : null;
    const avatarInput = mode === "register" ? avatarPicker() : null;
    const emailInput = el("input", {
      class: "login-input",
      type: "email",
      placeholder: "you@example.com",
      value: email,
      autofocus: true,
      oninput: (e) => (email = e.target.value),
    });
    const phoneInput =
      mode === "register"
        ? (registerPhoneField ??= PhoneField({ value: phone, onChange: (v) => (phone = v) })).el
        : null;
    const usernameInput = mode === "register" ? usernameField() : null;
    const passwordInput = el("input", {
      class: "login-input",
      type: "password",
      placeholder: "Пароль",
      autocomplete: mode === "register" ? "new-password" : "current-password",
      value: password,
      oninput: (e) => (password = e.target.value),
    });
    const card = el(
      "form",
      {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          error = null;
          pending = true;
          render();
          try {
            let user;
            let alreadyLinked = false;
            if (mode === "register") {
              ({ user } = await api.registerEmail(name, email, password, phone, username, lastName));
              if (avatarImage) await api.updateProfile(user.id, { avatarImage });
            } else {
              const res = await api.loginEmail(email, password);
              if (res.twoFactorRequired) {
                twoFactor = { ticket: res.ticket, name: res.name, method: res.method ?? "totp", hint: res.hint ?? null, scheduledDeletionAt: res.scheduledDeletionAt ?? null };
                pending = false;
                render();
                return;
              }
              user = res.user;
              alreadyLinked = res.alreadyLinked;
            }
            finishAuth(user, alreadyLinked);
          } catch (err) {
            error = err.message;
          } finally {
            pending = false;
            render();
          }
        },
      },
      [
        avatarInput,
        nameInput,
        lastNameInput,
        emailInput,
        phoneInput,
        usernameInput,
        passwordInput,
        mode === "register" ? el("p", { class: "login-hint" }, "Пароль — не короче 6 символов, хранится только в виде хеша.") : null,
        revokedNotice && mode === "login" && !error
          ? el("p", { class: "login-hint" }, "Сеанс на этом устройстве был завершён — войдите снова.")
          : null,
        bannedNotice && mode === "login" && !error
          ? el(
              "p",
              { class: "login-error" },
              bannedWhy
                ? `Этот аккаунт заблокирован администрацией Shalter. Причина: ${bannedWhy}`
                : "Этот аккаунт заблокирован администрацией Shalter."
            )
          : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "login-submit", disabled: pending }, pending ? "Проверка…" : mode === "login" ? "Войти" : "Создать аккаунт"),
        el(
          "button",
          {
            type: "button",
            class: "login-link",
            onclick: () => {
              mode = mode === "login" ? "register" : "login";
              error = null;
              render();
            },
          },
          mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"
        ),
        mode === "login" && !onSuccess
          ? el("div", { class: "login-alt-methods" }, [
              el(
                "button",
                {
                  type: "button",
                  class: "login-link qr-login-entry",
                  onclick: () => {
                    mode = "qr";
                    error = null;
                    startQrLogin();
                  },
                },
                [el("span", { html: iconSvg("Qrcode", 15) }), " Войти по QR-коду"]
              ),
              passkeysSupported()
                ? el(
                    "button",
                    {
                      type: "button",
                      class: "login-link qr-login-entry",
                      disabled: pending,
                      onclick: async () => {
                        error = null;
                        pending = true;
                        render();
                        try {
                          const res = await loginWithPasskey();
                          if (res.twoFactorRequired) {
                            twoFactor = { ticket: res.ticket, name: res.name, method: res.method ?? "totp", hint: res.hint ?? null, scheduledDeletionAt: res.scheduledDeletionAt ?? null };
                            return;
                          }
                          finishAuth(res.user, res.alreadyLinked);
                        } catch (err) {
                          error = passkeyErrorText(err);
                        } finally {
                          pending = false;
                          render();
                        }
                      },
                    },
                    [el("span", { html: iconSvg("Lock", 15) }), " Войти по ключу доступа"]
                  )
                : null,
              el(
                "button",
                {
                  type: "button",
                  class: "login-link qr-login-entry",
                  onclick: () => {
                    mode = "code";
                    error = null;
                    codeStep = "phone";
                    codeError = null;
                    render();
                  },
                },
                [el("span", { html: iconSvg("MessageCircle", 15) }), " Войти по коду из сообщения"]
              ),
              el(
                "button",
                {
                  type: "button",
                  class: "login-link muted",
                  onclick: () => {
                    mode = "recover";
                    error = null;
                    render();
                  },
                },
                "Забыли пароль?"
              ),
            ])
          : null,
        !embedded && !isInstalledApp() ? el("a", { class: "login-link muted login-download-link", href: "/download" }, "Скачать приложение для Windows, Linux и Android") : null,
      ]
    );

    const content = twoFactor
      ? renderTwoFactorPanel()
      : mode === "qr"
        ? renderQrPanel()
        : mode === "recover"
          ? renderRecoverPanel()
          : mode === "code"
            ? renderCodePanel()
            : card;

    if (embedded) {
      mount(root, content);
      return;
    }

    mount(
      root,
      el("div", { class: "login-page" }, [
        el("div", { class: "login-bg" }, [
          el("span", { class: "login-orb login-orb-1" }),
          el("span", { class: "login-orb login-orb-2" }),
          el("span", { class: "login-orb login-orb-3" }),
        ]),
        el("div", { class: "login-box" }, [
          el("div", { class: "login-header" }, [
            el("div", { class: "login-logo login-logo-shalter" }, [el("img", { src: "/icons/icon.svg", alt: "Shalter", draggable: false })]),
            el("h1", { class: "login-brand" }, addMode ? "Добавить аккаунт" : "Shalter"),
            el("p", { class: "login-subtitle" }, subtitle),
          ]),
          el("div", { class: "login-card" }, [
            content,
            addMode
              ? el("button", { class: "login-link center login-card-cancel", onclick: () => goToApp() }, "Отмена — вернуться в приложение")
              : null,
          ].filter(Boolean)),
        ].filter(Boolean)),
      ])
    );
  }

  render();
}
