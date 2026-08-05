import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { fileToAvatarDataUrl } from "../lib/image.js";
import qrcode from "../lib/qrcode.js";
import { formatPhoneInput } from "../lib/phoneFormat.js";

const QR_POLL_MS = 1500;

// options.onSuccess lets /qr-login (see qrLoginConfirm.js) reuse this same
// form to log the *scanning* device in, then continue to the confirm step
// in-place — the normal top-level /login instead defaults to a full
// navigation into the app. options.embedded renders just the form card,
// skipping the page chrome (background orbs, logo, "Shalter" brand) —
// for when a caller (again, qrLoginConfirm.js) supplies its own frame.
export function LoginView(root, { addMode, onSuccess, embedded } = {}) {
  const refFromLink = new URLSearchParams(window.location.search).get("ref") ?? "";
  let mode = refFromLink ? "register" : "login"; // "login" | "register" | "qr" | "code"
  let name = "";
  let email = "";
  let password = "";
  let phone = "";
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
              const { user } = await api.verifyCodeLogin(codePhone, codeValue);
              (onSuccess ?? goToApp)(user);
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
            el("input", {
              class: "login-input",
              type: "tel",
              placeholder: "+7 999 123-45-67",
              autofocus: true,
              value: codePhone,
              oninput: (e) => {
                codePhone = formatPhoneInput(e.target.value);
                e.target.value = codePhone;
              },
            }),
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
        ? el("input", {
            class: "login-input",
            type: "tel",
            placeholder: "+7 999 123-45-67",
            value: phone,
            oninput: (e) => {
              phone = formatPhoneInput(e.target.value);
              e.target.value = phone;
            },
          })
        : null;
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
              ({ user } = await api.registerEmail(name, email, password, phone, referralCode));
              if (avatarImage) await api.updateProfile(user.id, { avatarImage });
            } else {
              ({ user } = await api.loginEmail(email, password));
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
            ])
          : null,
      ]
    );

    const content = mode === "qr" ? renderQrPanel() : mode === "code" ? renderCodePanel() : card;

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
