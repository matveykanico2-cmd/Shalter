import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { fileToImageDataUrl } from "../lib/image.js";
import { Toggle } from "./toggle.js";

// Everything a new group or channel needs, at the moment it's created: picture,
// name, description, and — if it should be public — its @link.
//
// These used to be after-the-fact edits, and the @link and description were
// locked behind the chat's level, so a new channel started nameless and private
// and could only be published once its members had voted it up. Nobody can vote
// for a channel that doesn't exist yet.
export function openCreateChatDialog(kind, onSubmit) {
  let avatarImage = null;
  let isPublic = false;
  const isChannel = kind === "channel";
  const heading = isChannel ? "Новый канал" : "Новая группа";
  const what = isChannel ? "канала" : "группы";

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const titleInput = el("input", { class: "login-input", placeholder: `Название ${what}`, autofocus: true });
  const descInput = el("textarea", { class: "settings-input", rows: 2, placeholder: "Описание (необязательно)" });
  const usernameInput = el("input", {
    class: "login-input mono",
    placeholder: "юзернейм",
    oninput: (e) => {
      // Typed without the @ — it's shown as a fixed prefix beside the field, so
      // "@@name" can't happen.
      e.target.value = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "");
    },
  });
  const errorSlot = el("p", { class: "login-error" });

  const publicRow = el("div", { class: "create-chat-public" }, [
    el("div", {}, [
      el("p", { class: "settings-toggle-title" }, `Публичный ${isChannel ? "канал" : "группа"}`),
      el("p", { class: "settings-toggle-hint" }, "Виден в поиске, зайти можно по ссылке без приглашения"),
    ]),
    Toggle(false, (v) => {
      isPublic = v;
      handleRow.hidden = !v;
      if (v) usernameInput.focus();
    }),
  ]);
  const handleRow = el("div", { class: "create-chat-handle" }, [el("span", { class: "create-chat-at" }, "@"), usernameInput]);
  handleRow.hidden = true;

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
    descInput,
    publicRow,
    handleRow,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          const title = titleInput.value.trim();
          if (!title) return (errorSlot.textContent = "Введите название");
          const username = usernameInput.value.trim();
          // Checked here as well as on the server so the whole member-picking
          // step isn't spent on a name that will be refused at the end of it.
          if (isPublic && username.length < 5) {
            return (errorSlot.textContent = "Юзернейм — от 5 символов, латиница, цифры и _");
          }
          close();
          onSubmit(title, avatarImage, {
            description: descInput.value.trim(),
            username: isPublic ? username : null,
            isPublic,
          });
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
