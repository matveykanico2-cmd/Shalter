import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { fileToImageDataUrl } from "../lib/image.js";

// Title + optional avatar picture — used for both "new group" and "new
// channel", so creating one no longer forces the plain-text-only window.prompt.
export function openCreateChatDialog(kind, onSubmit) {
  let avatarImage = null;
  const heading = kind === "channel" ? "Новый канал" : "Новая группа";
  const placeholder = kind === "channel" ? "Название канала" : "Название группы";

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const titleInput = el("input", { class: "login-input", placeholder, autofocus: true });
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
    [avatarPreview, el("span", { class: "create-chat-avatar-label" }, "Фото (необязательно)")]
  );

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, heading),
    avatarBtn,
    avatarFileInput,
    titleInput,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          const title = titleInput.value.trim();
          if (!title) return (errorSlot.textContent = "Введите название");
          close();
          onSubmit(title, avatarImage);
        },
      },
      "Далее"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
