import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";
import { fileToImageDataUrl } from "../lib/image.js";

// Everything about a bot that isn't its code or its token: name, picture,
// description, @handle.
//
// All four were fixed at creation. Getting any of them wrong meant deleting the
// bot — losing its token and every chat it was in — and starting over.
export function openEditBotDialog(bot, onSaved) {
  let avatarImage = bot.user.avatarImage ?? null;
  let busy = false;
  let error = null;
  let notice = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "edit-chat-body" });
  const dialog = el("div", { class: "modal-dialog edit-chat-dialog" }, [
    el("h2", { class: "modal-title" }, "Настройки бота"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  const nameInput = el("input", { class: "login-input", value: bot.user.name ?? "" });
  const descInput = el("textarea", { class: "settings-input", rows: 3, value: bot.description ?? "" });
  const usernameInput = el("input", {
    class: "login-input mono",
    value: bot.user.username ?? "",
    oninput: (e) => {
      e.target.value = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "");
    },
  });
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      avatarImage = await fileToImageDataUrl(file, 512);
      render();
    },
  });

  async function save() {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const res = await api.updateBot(bot.id, {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
        username: usernameInput.value.trim(),
        avatarImage,
      });
      bot = { ...bot, ...res.bot };
      notice = "Сохранено";
      onSaved?.(bot);
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    clear(body);
    body.append(
      ...[
        el("div", { class: "edit-chat-avatar-row" }, [
          Avatar({ name: bot.user.name, color: bot.user.avatarColor, image: avatarImage, size: 64 }),
          el("div", { class: "edit-chat-avatar-actions" }, [
            el("button", { class: "profile-action-btn", onclick: () => fileInput.click() }, "Загрузить фото"),
            avatarImage ? el("button", { class: "profile-action-btn danger", onclick: () => { avatarImage = null; render(); } }, "Убрать фото") : null,
          ].filter(Boolean)),
          fileInput,
        ]),
        el("p", { class: "settings-field-label" }, "Имя"),
        nameInput,
        el("p", { class: "settings-field-label" }, "Юзернейм"),
        el("div", { class: "create-chat-handle" }, [el("span", { class: "create-chat-at" }, "@"), usernameInput]),
        el("p", { class: "settings-toggle-hint" }, "Должен заканчиваться на _bot — так его отличают от аккаунта человека."),
        el("p", { class: "settings-field-label" }, "Описание"),
        descInput,
        error ? el("p", { class: "login-error" }, error) : null,
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: save }, busy ? "Сохраняем…" : "Сохранить"),
      ].filter(Boolean)
    );
  }

  render();
}
