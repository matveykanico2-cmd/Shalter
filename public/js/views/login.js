import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { fileToAvatarDataUrl } from "../lib/image.js";
import qrcode from "../lib/qrcode.js";
import { PhoneField } from "../components/phoneField.js";

const QR_POLL_MS = 1500;

// options.onSuccess lets /qr-login (see qrLoginConfirm.js) reuse this same
// form to log the *scanning* device in, then continue to the confirm step
// in-place — the normal top-level /login instead defaults to a full
// navigation into the app. options.embedded renders just the form card,
// skipping the page chrome (background orbs, logo, "Shalter" brand) —
// for when a caller (again, qrLoginConfirm.js) supplies its own frame.
export function LoginView(root, { addMode, onSuccess, embedded } = {}) {
  const refFromLink = new URLSearchParams(window.location.search).get("ref") ?? "";
  // Landed here from api.js's req() after this device's session got
  // terminated elsewhere (Settings → Устройства → «Завершить») — surfaced as
  // a plain "why am I here" hint rather than leaving it looking like a random
  // logout.
  const revokedNotice = new URLSearchParams(window.location.search).get("reason") === "revoked";
  // Same idea, for an account banned from the reports moderation chat
  // (routes/reports.js's /:id/ban) — surfaced here rather than a bare
  // "неверный email или пароль" that'd make it look like a typo.
  const bannedNotice = new URLSearchParams(window.location.search).get("reason") === "banned";
  // The recorded ban reason, forwarded by api.js — a ban with no stated reason
  // is indistinguishable from a bug from the user's side.
  const bannedWhy = new URLSearchParams(window.location.search).get("why");
  let mode = refFromLink ? "register" : "login"; // "login" | "register" | "qr" | "code"
  let name = "";
  let email = "";
  let password = "";
  let phone = "";
  let username = "";
  let referralCode = refFromLink;
  let avatarImage = null;
  let error = null;
  let pending = false;

  let qrToken = null;
  let qrLoginUrl = null;
  let qrStatus = "loading"; // "loading" | "ready" | "expired" | "error"
  let qrPollTimer = null;

  let codePhone = "";
  let codeValue = "";
  let codeStep = "phone"; // "phone" | "code"
  let codeError = null;
  let codePending = false;

  // Second factor (server/lib/totp.js). Set when a first factor succeeded on an
  // account with 2FA on: the server withheld the session and handed back a
  // ticket instead, so the only thing left to render is the code prompt.
  // The phone fields keep their own state (country + digits), so they are
  // created once and reused across renders rather than rebuilt.
  let codePhoneField = null;
  let registerPhoneField = null;
  let twoFactor = null; // { ticket, name, method }
  let recoverEmail = "";
  let recoverPhone = "";
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
            // The scan itself worked — the account just isn't allowed in. Say
            // so instead of silently minting a fresh code forever.
            stopQrPolling();
            mode = "login";
            error = poll.error || "Аккаунт заблокирован администрацией Shalter";
            render();
          } else if (poll.status === "expired") {
            startQrLogin(); // silently mint a fresh code so it never goes stale
          }
        } catch {
          // A transient network hiccup shouldn't kill the whole flow — just
          // wait for the next tick.
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

  function qrCodeSvg(text) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 12, scalable: true });
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

  // Shown instead of the login form once the first factor is done and the
  // account owes a code. Its own panel rather than a mode of the main form: at
  // this point email/password/register are all irrelevant, and leaving them on
  // screen invites re-submitting the first step and invalidating the ticket.
  function renderTwoFactorPanel() {
    const codeInput = el("input", {
      class: "login-input login-code-input mono",
      inputmode: "text",
      placeholder: "······",
      autofocus: true,
      autocomplete: "one-time-code",
      // Same reason as the login-code input below: oninput must not call
      // render(), or the field is replaced mid-typing and loses focus. Recovery
      // codes are letters and a dash, so this can't filter to digits only.
      oninput: (e) => (twoFactorCode = e.target.value.trim()),
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
            const { user } = await api.twoFactorLogin(twoFactor.ticket, twoFactorCode);
            (onSuccess ?? goToApp)(user);
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
          twoFactor.method === "chat"
            ? "Код отправлен в ваш чат с Shalter — откройте его на устройстве, где вы уже вошли. Можно ввести и код восстановления."
            : "Код из приложения-аутентификатора. Можно ввести и код восстановления."
        ),
        // Only for the chat method: the code lives in a message that can be
        // missed, expire, or arrive while the app is closed. A TOTP app always
        // has a fresh code, so there is nothing to re-send.
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
      el("p", { class: "qr-login-title" }, "Двухфакторная аутентификация"),
      el("p", { class: "qr-login-instructions" }, `Вход в аккаунт${twoFactor.name ? ` ${twoFactor.name}` : ""} защищён вторым фактором — введите текущий код.`),
      form,
      el(
        "button",
        {
          type: "button",
          class: "login-link",
          onclick: () => {
            // Abandoning the ticket rather than reusing it: it's single-purpose
            // and the server expires it anyway.
            twoFactor = null;
            twoFactorCode = "";
            twoFactorError = null;
            mode = "login";
            render();
          },
        },
        "Отмена"
      ),
    ]);
  }

  // Forgotten password: the e-mail and the phone of the same account, then a new
  // password. See server/routes/auth.js's /recover for what this is and isn't
  // worth — the screen says the same thing, because someone choosing it should
  // know that turning on two-factor is what closes this door.
  let recoverPhoneField = null;
  function renderRecoverPanel() {
    const emailInput = el("input", { class: "login-input", type: "email", placeholder: "you@example.com", value: recoverEmail, oninput: (e) => (recoverEmail = e.target.value) });
    const passInput = el("input", { class: "login-input", type: "password", placeholder: "Новый пароль", value: recoverPassword, oninput: (e) => (recoverPassword = e.target.value) });
    recoverPhoneField ??= PhoneField({ onChange: (v) => (recoverPhone = v) });

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
            const { user } = await api.recoverAccount(recoverEmail.trim(), recoverPhone, recoverPassword);
            (onSuccess ?? goToApp)(user);
          } catch (err) {
            recoverError = err.message;
            recoverPending = false;
            render();
          }
        },
      },
      [
        emailInput,
        recoverPhoneField.el,
        passInput,
        el("p", { class: "login-hint" }, "Почта и номер должны быть от одного аккаунта. Все остальные сеансы будут завершены, а в чат Shalter придёт уведомление."),
        recoverError ? el("p", { class: "login-error center" }, recoverError) : null,
        el("button", { class: "login-submit", disabled: recoverPending }, recoverPending ? "Проверяем…" : "Восстановить доступ"),
      ].filter(Boolean)
    );

    return el("div", { class: "qr-login-panel" }, [
      el("p", { class: "qr-login-title" }, "Забыли пароль?"),
      el("p", { class: "qr-login-instructions" }, "Введите почту и номер телефона аккаунта и придумайте новый пароль."),
      form,
      el("button", { type: "button", class: "login-link", onclick: () => { mode = "login"; recoverError = null; render(); } }, "Назад ко входу"),
    ]);
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
                twoFactor = { ticket: res.ticket, name: res.name, method: res.method ?? "totp" };
                codePending = false;
                render();
                return;
              }
              (onSuccess ?? goToApp)(res.user);
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
            // Built once and cached on the closure: PhoneField holds its own
            // state (chosen country, digits typed), so rebuilding it on every
            // render would reset the picker mid-entry.
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
            // Not gated on codeValue.length here: the code input's oninput
            // deliberately doesn't call render() (typing would lose focus —
            // every render() fully replaces the DOM, same reason the
            // email/password inputs above don't re-render on keystroke
            // either), so a length-based disabled state would never update
            // after the first digit. The server validates the code anyway.
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

  // The @handle field. Registration asks for one because it's the only way to
  // find anyone here — contacts are added by typing an exact @username (see
  // views/contacts.js) — so an account created without one can't be reached by
  // anybody until its owner goes looking for the setting.
  //
  // Built once, outside render(), and updated in place. render() replaces the
  // whole form DOM (see the code-input comment above), so a field that called
  // it on every keystroke would hand the user a fresh, unfocused <input> after
  // the first character — the same bug the contacts search had.
  const usernameStatus = el("p", { class: "login-hint username-status" });
  let usernameCheckTimer = null;
  let usernameCheckSeq = 0;
  const usernameEl = el("input", {
    class: "login-input mono",
    placeholder: "@юзернейм",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
    autocomplete: "username",
    oninput: (e) => {
      // Normalize as they type: drop a pasted leading @, keep only what the
      // server's USERNAME_RE accepts, cap at 32. Doing it here means the field
      // can't hold something the server will reject for a reason the user can't
      // see — and the caret stays put because the value only changes when the
      // filter actually removed something.
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
    // A response for an abandoned value must never overwrite the current one —
    // these come back out of order the moment someone types quickly.
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
    const referralInput =
      mode === "register"
        ? el("input", {
            class: "login-input login-code-field mono",
            placeholder: "Код друга",
            value: referralCode,
            oninput: (e) => (referralCode = e.target.value.toUpperCase()),
          })
        : null;

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
            if (mode === "register") {
              ({ user } = await api.registerEmail(name, email, password, phone, username, referralCode));
              if (avatarImage) await api.updateProfile(user.id, { avatarImage });
            } else {
              const res = await api.loginEmail(email, password);
              // Password was right, but the account has 2FA on — no session was
              // created, so hand over to the code step instead of continuing.
              if (res.twoFactorRequired) {
                twoFactor = { ticket: res.ticket, name: res.name, method: res.method ?? "totp" };
                pending = false;
                render();
                return;
              }
              user = res.user;
            }
            (onSuccess ?? goToApp)(user);
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
        emailInput,
        phoneInput,
        usernameInput,
        passwordInput,
        referralInput,
        mode === "register"
          ? el(
              "p",
              { class: `login-hint ${referralCode ? "referral-hint" : ""}` },
              referralCode ? "🎁 Вы и ваш друг получите Shalter Premium бесплатно" : "Необязательно — если вас пригласил друг"
            )
          : null,
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
                [el("span", { html: iconSvg("Send", 15) }), " Войти по коду из сообщения"]
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
        // A plain link, not a router link: /download is a standalone static page
        // (see server/index.js), and this is the only place a first-time visitor
        // would look for the desktop/Android build.
        !embedded ? el("a", { class: "login-link muted login-download-link", href: "/download" }, "Скачать приложение для Windows, Linux и Android") : null,
      ]
    );

    // The 2FA prompt outranks `mode`: once a ticket exists, the first factor is
    // already spent and nothing else on this screen is actionable.
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
            el("div", { class: "login-logo" }, [el("span", { html: iconSvg("Send", 26) })]),
            el("h1", { class: "login-brand" }, addMode ? "Добавить аккаунт" : "Shalter"),
            el("p", { class: "login-subtitle" }, subtitle),
          ]),
          el("div", { class: "login-card" }, content),
        ]),
      ])
    );
  }

  render();
}
