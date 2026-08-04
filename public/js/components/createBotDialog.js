import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { fileToImageDataUrl } from "../lib/image.js";

// Same avatar+title shape as createChatDialog.js's group/channel creation,
// plus an optional description — used for the "real, programmable" bots
// (server/routes/botApi.js). onSubmit gets (name, avatarImage, description).
export function openCreateBotDialog(onSubmit) {
  let avatarImage = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const nameInput = el("input", { class: "login-input", placeholder: "Имя бота", autofocus: true });
  const descInput = el("textarea", { class: "settings-input", rows: 2, placeholder: "Описание (необязательно)" });
  const errorSlot = el("p", { class: "login-error" });

  const avatarPreview = el("div", { class: "create-chat-avatar-preview" }, [el("span", { html: iconSvg("Users", 22) })]);
  const avatarFileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      avatarImage = await fileToImageDataUrl(file, 512);
      avatarPreview.textContent = "";
      avatarPreview.appendChild(el("img", { src: avatarImage, class: "create-chat-avatar-img" }));
    },
  });
  const avatarBtn = el(
    "button",
    { class: "create-chat-avatar-btn", onclick: () => avatarFileInput.click() },
    [avatarPreview, el("span", { class: "create-chat-avatar-label" }, "Аватарка (необязательно)")]
  );

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Новый бот"),
    el("p", { class: "settings-toggle-hint" }, "Вы получите токен для программирования бота — см. документацию после создания."),
    avatarBtn,
    avatarFileInput,
    nameInput,
    descInput,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          const name = nameInput.value.trim();
          if (!name) return (errorSlot.textContent = "Введите имя бота");
          close();
          onSubmit(name, avatarImage, descInput.value.trim());
        },
      },
      "Создать"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
