import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { fileToImageDataUrl } from "../lib/image.js";

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
      if (isPublic) typeHint.textContent = `Найти и открыть по ссылке сможет любой: shalter.ru/${e.target.value || "юзернейм"}`;
    },
  });
  const errorSlot = el("p", { class: "login-error" });

  // Telegram's own "Channel type" step: the choice is public-or-private, not a
  // switch with an optional extra field. A public one needs a @link — that's
  // what makes it public — so the field is required rather than offered.
  const typeHint = el("p", { class: "settings-toggle-hint" });
  const handleRow = el("div", { class: "create-chat-handle" }, [el("span", { class: "create-chat-at" }, "@"), usernameInput]);

  function setType(pub) {
    isPublic = pub;
    handleRow.hidden = !pub;
    typeHint.textContent = pub
      ? `Найти и открыть по ссылке t.me-стиля сможет любой: shalter.ru/${usernameInput.value || "юзернейм"}`
      : `Вступить можно только по пригласительной ссылке — она появится сразу после создания.`;
    for (const b of typeRow.querySelectorAll(".contacts-add-mode")) b.classList.toggle("active", (b.dataset.pub === "1") === pub);
    if (pub) usernameInput.focus();
  }

  const typeRow = el("div", { class: "contacts-add-modes" }, [
    el("button", { class: "contacts-add-mode active", "data-pub": "0", onclick: () => setType(false) }, `Частн${isChannel ? "ый" : "ая"}`),
    el("button", { class: "contacts-add-mode", "data-pub": "1", onclick: () => setType(true) }, `Публичн${isChannel ? "ый" : "ая"}`),
  ]);
  const publicRow = el("div", {}, [
    el("p", { class: "settings-field-label" }, isChannel ? "Тип канала" : "Тип группы"),
    typeRow,
    typeHint,
  ]);
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
          // Required, not optional: a public chat without a handle is just a
          // private one that says otherwise. Checked here as well as on the
          // server so the whole member-picking step isn't spent on a name that
          // will be refused at the end of it.
          if (isPublic && username.length < 5) {
            return (errorSlot.textContent = "Для публичного нужен юзернейм — от 5 символов, латиница, цифры и _");
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
  setType(false);
}
