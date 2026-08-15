import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { fileToImageDataUrl } from "../lib/image.js";
import { Toggle } from "./toggle.js";
import { Avatar } from "./avatar.js";

// Editing a group or channel after it exists: picture, name, description, and
// the public @link. Owners and admins only — enforced on the server too
// (routes/chats.js's PATCH), this just decides whether to offer the screen.
//
// Before this there was no edit screen at all: a chat's name and picture were
// whatever they were set to at creation, and the only editable thing anywhere in
// the info panel was the public link.
export function openEditChatDialog(chat, onSaved) {
  const isChannel = chat.type === "channel";
  const what = isChannel ? "канал" : "группу";

  let avatarImage = chat.avatarImage ?? null;
  let avatarColor = chat.avatarColor ?? null;
  let isPublic = !!chat.isPublic;
  let colors = [];
  let permissions = null;
  let permFields = [];
  let inviteLink = chat.inviteCode ? `${window.location.origin}/join/${chat.inviteCode}` : null;
  let busy = false;
  let error = null;
  let notice = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "edit-chat-body" });
  const dialog = el("div", { class: "modal-dialog edit-chat-dialog" }, [
    el("h2", { class: "modal-title" }, `Редактировать ${what}`),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  const titleInput = el("input", { class: "login-input", value: chat.title ?? "" });
  const descInput = el("textarea", { class: "settings-input", rows: 3, value: chat.description ?? "" });
  const usernameInput = el("input", {
    class: "login-input mono",
    value: chat.username ?? "",
    placeholder: "юзернейм",
    oninput: (e) => {
      e.target.value = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "");
    },
  });
  const avatarFileInput = el("input", {
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

  // The palette is the one thing a chat's level still gates (see
  // server/lib/chatFeatures.js), so it's fetched rather than assumed.
  if (!isChannel) {
    api
      .getChatPermissions(chat.id)
      .then((res) => {
        permissions = res.permissions;
        permFields = res.fields ?? [];
        render();
      })
      .catch(() => {});
  }

  api
    .getChatFeatures(chat.id)
    .then((res) => {
      colors = res.colors ?? [];
      render();
    })
    .catch(() => {});

  async function save() {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const patch = {
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        avatarImage,
        avatarColor,
      };
      if (!patch.title) throw new Error("Название не может быть пустым");
      const { chat: updated } = await api.patchChat(chat.id, patch);
      chat = { ...chat, ...updated };
      // The public link is its own route: it claims a global @handle and needs
      // the uniqueness check that a plain PATCH doesn't do.
      const wantPublic = isPublic;
      const handle = usernameInput.value.trim();
      if (wantPublic !== !!chat.isPublic || (wantPublic && handle !== (chat.username ?? ""))) {
        const res = await api.setChannelPublic(chat.id, wantPublic, handle);
        chat = { ...chat, ...res.chat };
      }
      notice = "Сохранено";
      onSaved?.(chat);
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
          Avatar({ name: chat.title, color: avatarColor, image: avatarImage, size: 64 }),
          el("div", { class: "edit-chat-avatar-actions" }, [
            el("button", { class: "profile-action-btn", onclick: () => avatarFileInput.click() }, "Загрузить фото"),
            avatarImage
              ? el("button", { class: "profile-action-btn danger", onclick: () => { avatarImage = null; render(); } }, "Убрать фото")
              : null,
          ].filter(Boolean)),
          avatarFileInput,
        ]),

        el("p", { class: "settings-field-label" }, "Название"),
        titleInput,
        el("p", { class: "settings-field-label" }, "Описание"),
        descInput,

        // The palette: the level reward. Locked entries stay visible with the
        // level they need — a palette that just hides what you haven't earned
        // teaches nobody that there's anything to earn.
        colors.length
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, "Цвет"),
              el(
                "div",
                { class: "chat-color-grid" },
                colors.map((c) =>
                  el("button", {
                    class: `chat-color-swatch ${avatarColor === c.hex ? "active" : ""} ${c.unlocked ? "" : "locked"}`,
                    style: { background: c.hex },
                    title: c.unlocked ? c.name : `${c.name} — с ${c.level}-го уровня`,
                    onclick: () => {
                      if (!c.unlocked) {
                        error = `Цвет «${c.name}» открывается на ${c.level}-м уровне`;
                        render();
                        return;
                      }
                      avatarColor = c.hex;
                      error = null;
                      render();
                    },
                  }, c.unlocked ? null : el("span", { class: "chat-color-lock", html: iconSvg("Lock", 11) }))
                )
              ),
            ])
          : null,

        // Who may do what, for everyone who isn't staff. Groups only — posting
        // in a channel is already admin-only.
        !isChannel && permissions
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, "Права участников"),
              el("p", { class: "settings-toggle-hint" }, "Не касается владельцев, админов и модераторов — у них права остаются полными."),
              ...permFields.map((f) =>
                el("div", { class: "settings-toggle-row no-divider" }, [
                  el("p", { class: "settings-toggle-title" }, f.label),
                  Toggle(permissions[f.id] !== false, async (v) => {
                    permissions = { ...permissions, [f.id]: v };
                    render();
                    try {
                      await api.setChatPermissions(chat.id, permissions);
                    } catch (err) {
                      error = err.message || "Не удалось сохранить права";
                      render();
                    }
                  }),
                ])
              ),
            ])
          : null,

        // The invite link: how anyone joins a private chat. Shown for public
        // ones too — a link works whether or not there's an @handle, and it's
        // what gets pasted into a message.
        el("p", { class: "settings-field-label" }, "Пригласительная ссылка"),
        el("p", { class: "settings-toggle-hint" }, "По ней можно вступить без приглашения от админа. Отозвать — если ссылка утекла."),
        el("div", { class: "invite-link-row" }, [
          el("input", { class: "login-input mono invite-link-input", readOnly: true, value: inviteLink ?? "", placeholder: "Ссылка ещё не создана" }),
          el(
            "button",
            {
              class: "btn-accent-pill",
              disabled: busy,
              onclick: async () => {
                try {
                  const { code } = await api.chatInviteLink(chat.id, !!inviteLink);
                  inviteLink = `${window.location.origin}/join/${code}`;
                  notice = inviteLink && chat.inviteCode ? "Ссылка обновлена — старая больше не работает" : "Ссылка создана";
                  chat = { ...chat, inviteCode: code };
                } catch (err) {
                  error = err.message || "Не удалось получить ссылку";
                }
                render();
              },
            },
            inviteLink ? "Отозвать и создать новую" : "Создать ссылку"
          ),
        ]),
        inviteLink
          ? el(
              "button",
              {
                class: "profile-action-btn",
                onclick: async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                    notice = "Ссылка скопирована";
                  } catch {
                    notice = "Скопируйте ссылку вручную — буфер обмена недоступен";
                  }
                  render();
                },
              },
              "Скопировать ссылку"
            )
          : null,

        el("div", { class: "create-chat-public" }, [
          el("div", {}, [
            el("p", { class: "settings-toggle-title" }, `Публичн${isChannel ? "ый канал" : "ая группа"}`),
            el("p", { class: "settings-toggle-hint" }, "Виден в поиске, зайти можно по ссылке без приглашения"),
          ]),
          Toggle(isPublic, (v) => {
            isPublic = v;
            render();
          }),
        ]),
        isPublic ? el("div", { class: "create-chat-handle" }, [el("span", { class: "create-chat-at" }, "@"), usernameInput]) : null,

        error ? el("p", { class: "login-error" }, error) : null,
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        el("button", { class: "btn-accent", disabled: busy, onclick: save }, busy ? "Сохраняем…" : "Сохранить"),
      ].filter(Boolean)
    );
  }

  render();
}
