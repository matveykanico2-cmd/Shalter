import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { fileToAvatarDataUrl } from "../lib/image.js";

export function LoginView(root, { addMode }) {
  let method = "phone"; // "phone" | "email"
  let step = "phone"; // "phone" | "code" | "profile" | "email"
  let emailMode = "login"; // "login" | "register"
  let phone = "+7 ";
  let name = "";
  let email = "";
  let password = "";
  let avatarImage = null;
  let error = null;
  let pending = false;
  let resendIn = 30;
  let newUserId = null;
  let resendTimer = null;

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

  function render() {
    clearInterval(resendTimer);
    if (step === "code") {
      resendTimer = setInterval(() => {
        resendIn = Math.max(0, resendIn - 1);
        const btn = root.querySelector("[data-resend]");
        if (btn) btn.textContent = resendIn > 0 ? `Отправить код повторно через ${resendIn}с` : "Отправить код повторно";
      }, 1000);
    }

    const subtitle =
      step === "phone"
        ? "Введите номер телефона"
        : step === "code"
          ? `Код отправлен на ${phone}`
          : step === "profile"
            ? "Расскажите немного о себе"
            : emailMode === "login"
              ? "Войдите по email и паролю"
              : "Создайте аккаунт по email";

    const methodSwitch =
      step === "phone" || step === "email"
        ? el("div", { class: "login-method-switch" }, [
            el(
              "button",
              {
                class: `login-method-btn ${method === "phone" ? "active" : ""}`,
                onclick: () => {
                  method = "phone";
                  step = "phone";
                  error = null;
                  render();
                },
              },
              "Телефон"
            ),
            el(
              "button",
              {
                class: `login-method-btn ${method === "email" ? "active" : ""}`,
                onclick: () => {
                  method = "email";
                  step = "email";
                  error = null;
                  render();
                },
              },
              "Email"
            ),
          ])
        : null;

    let card;
    if (step === "phone") {
      const phoneInput = el("input", {
        value: phone,
        inputmode: "tel",
        placeholder: "+7 900 000-00-00",
        class: "login-input",
        oninput: (e) => (phone = e.target.value),
      });
      card = el("form", {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          error = null;
          pending = true;
          render();
          try {
            await api.sendCode(phone);
            step = "code";
            resendIn = 30;
          } catch (err) {
            error = err.message;
          } finally {
            pending = false;
            render();
          }
        },
      }, [
        phoneInput,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "login-submit", disabled: pending }, pending ? "Отправка…" : "Продолжить"),
      ]);
    } else if (step === "code") {
      const codeInput = el("input", {
        inputmode: "numeric",
        placeholder: "•••••",
        class: "login-input login-code-input",
        autofocus: true,
        oninput: async (e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
          e.target.value = v;
          if (v.length === 5) {
            error = null;
            pending = true;
            render();
            try {
              const { user, isNew } = await api.verifyCode(phone, v);
              if (isNew) {
                newUserId = user.id;
                step = "profile";
              } else {
                goToApp();
                return;
              }
            } catch (err) {
              error = err.message;
            } finally {
              pending = false;
              render();
            }
          }
        },
      });
      card = el("div", { class: "login-form" }, [
        codeInput,
        el("p", { class: "login-hint mono" }, "демо-код: 00000"),
        error ? el("p", { class: "login-error center" }, error) : null,
        el(
          "button",
          {
            type: "button",
            "data-resend": "1",
            class: "login-link",
            disabled: resendIn > 0,
            onclick: () => {
              resendIn = 30;
              render();
            },
          },
          resendIn > 0 ? `Отправить код повторно через ${resendIn}с` : "Отправить код повторно"
        ),
        el(
          "button",
          { type: "button", class: "login-link muted", onclick: () => { step = "phone"; render(); } },
          "Изменить номер"
        ),
      ]);
    } else if (step === "email") {
      const nameInput =
        emailMode === "register"
          ? el("input", { class: "login-input", placeholder: "Имя", value: name, oninput: (e) => (name = e.target.value) })
          : null;
      const avatarInput = emailMode === "register" ? avatarPicker() : null;
      const emailInput = el("input", {
        class: "login-input",
        type: "email",
        placeholder: "you@example.com",
        value: email,
        oninput: (e) => (email = e.target.value),
      });
      const passwordInput = el("input", {
        class: "login-input",
        type: "password",
        placeholder: "Пароль",
        autocomplete: emailMode === "register" ? "new-password" : "current-password",
        value: password,
        oninput: (e) => (password = e.target.value),
      });
      card = el("form", {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          error = null;
          pending = true;
          render();
          try {
            if (emailMode === "register") {
              const { user } = await api.registerEmail(name, email, password);
              if (avatarImage) await api.updateProfile(user.id, { avatarImage });
            } else {
              await api.loginEmail(email, password);
            }
            goToApp();
          } catch (err) {
            error = err.message;
          } finally {
            pending = false;
            render();
          }
        },
      }, [
        nameInput,
        avatarInput,
        emailInput,
        passwordInput,
        emailMode === "register" ? el("p", { class: "login-hint" }, "Не короче 6 символов. Пароль хранится только в виде хеша.") : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "login-submit", disabled: pending }, pending ? "Проверка…" : emailMode === "login" ? "Войти" : "Зарегистрироваться"),
        el(
          "button",
          {
            type: "button",
            class: "login-link",
            onclick: () => {
              emailMode = emailMode === "login" ? "register" : "login";
              error = null;
              render();
            },
          },
          emailMode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"
        ),
      ]);
    } else if (step === "profile") {
      const submitBtn = el("button", { class: "login-submit", disabled: pending || !name.trim() }, "Готово");
      const nameInput = el("input", {
        class: "login-input",
        placeholder: "Имя",
        value: name,
        autofocus: true,
        oninput: (e) => {
          name = e.target.value;
          submitBtn.disabled = pending || !name.trim();
        },
      });
      card = el("form", {
        class: "login-form",
        onsubmit: async (e) => {
          e.preventDefault();
          if (!newUserId || !name.trim()) return;
          pending = true;
          render();
          try {
            const patch = { name: name.trim(), username: name.trim().toLowerCase().replace(/\s+/g, "_") };
            if (avatarImage) patch.avatarImage = avatarImage;
            await api.updateProfile(newUserId, patch);
            goToApp();
          } finally {
            pending = false;
            render();
          }
        },
      }, [avatarPicker(), nameInput, submitBtn]);
    }

    mount(
      root,
      el("div", { class: "login-page" }, [
        el("div", { class: "login-box" }, [
          el("div", { class: "login-header" }, [
            el("div", { class: "login-logo" }, "М"),
            el("h1", { class: "login-title" }, addMode ? "Добавить аккаунт" : "Вход в мессенджер"),
            el("p", { class: "login-subtitle" }, subtitle),
          ]),
          methodSwitch,
          el("div", { class: "login-card" }, card),
        ]),
      ])
    );
  }

  render();
}
