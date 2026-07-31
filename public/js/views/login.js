import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { fileToAvatarDataUrl } from "../lib/image.js";

export function LoginView(root, { addMode }) {
  let mode = "login"; // "login" | "register"
  let name = "";
  let email = "";
  let password = "";
  let avatarImage = null;
  let error = null;
  let pending = false;

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
    const subtitle = mode === "login" ? "Войдите по email и паролю" : "Создайте аккаунт по email";

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
            if (mode === "register") {
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
      },
      [
        avatarInput,
        nameInput,
        emailInput,
        passwordInput,
        mode === "register" ? el("p", { class: "login-hint" }, "Не короче 6 символов. Пароль хранится только в виде хеша.") : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "login-submit", disabled: pending }, pending ? "Проверка…" : mode === "login" ? "Войти" : "Зарегистрироваться"),
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
      ]
    );

    mount(
      root,
      el("div", { class: "login-page" }, [
        el("div", { class: "login-box" }, [
          el("div", { class: "login-header" }, [
            el("div", { class: "login-logo" }, "М"),
            el("h1", { class: "login-title" }, addMode ? "Добавить аккаунт" : "Вход в мессенджер"),
            el("p", { class: "login-subtitle" }, subtitle),
          ]),
          el("div", { class: "login-card" }, card),
        ]),
      ])
    );
  }

  render();
}
