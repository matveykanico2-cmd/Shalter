import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { fileToImageDataUrl, fileToImageUpload } from "../lib/image.js";
import { uploadFile } from "../lib/upload.js";
import { Toggle } from "./toggle.js";
import { Avatar } from "./avatar.js";
import { openChatPickerDialog } from "./chatPickerDialog.js";

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
  let requests = [];
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

  // Плата звёздами за комментарий под постом канала — несохранённое значение
  // же теряется при перерисовке render(), поэтому поле живёт здесь.
  const commentPriceInput = el("input", { class: "settings-input mono", type: "number", min: "0", max: "90000", step: "1", value: String(chat.commentPriceStars ?? 0) });
  async function saveCommentPrice() {
    error = null;
    notice = null;
    try {
      const res = await api.setCommentPrice(chat.id, Number(commentPriceInput.value));
      chat = { ...chat, commentPriceStars: res.commentPriceStars };
      notice = res.commentPriceStars > 0 ? `Комментарии стоят ${res.commentPriceStars} ⭐` : "Комментарии бесплатны";
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    }
    render();
  }

  // Истории канала: тот же кадр-за-кадром поток, что и у личных историй
  // (components/storiesBar.js), только адресован не себе, а каналу.
  let storyProgress = null;
  const storyInput = el("input", { type: "file", accept: "image/*,video/*", class: "hidden-input", multiple: true });
  async function postChannelStory(files) {
    const items = [];
    for (const [i, file] of files.entries()) {
      const isVideo = file.type.startsWith("video/");
      storyProgress = `Загружаем ${i + 1} из ${files.length}…`;
      render();
      const upload = isVideo ? file : await fileToImageUpload(file, 1080);
      const { url } = await uploadFile(upload, isVideo ? "video" : "image");
      items.push({ kind: isVideo ? "video" : "image", url });
    }
    if (!items.length) return;
    await api.postChannelStory(chat.id, items);
    notice = "История опубликована";
  }
  storyInput.onchange = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    error = null;
    notice = null;
    try {
      await postChannelStory(files);
    } catch (err) {
      error = err.message || "Не удалось выложить историю";
    } finally {
      storyProgress = null;
      render();
    }
  };

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
    .listJoinRequests(chat.id)
    .then((res) => {
      requests = res.requests ?? [];
      render();
    })
    .catch(() => {});

  api
    .getChatFeatures(chat.id)
    .then((res) => {
      colors = res.colors ?? [];
      render();
    })
    .catch(() => {});

  async function saveSetting(patch) {
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const { chat: updated } = await api.setChatSettings(chat.id, patch);
      chat = { ...chat, ...updated };
      notice = "Сохранено";
      onSaved?.(chat);
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    } finally {
      busy = false;
      render();
    }
  }

  async function answer(userId, approve) {
    busy = true;
    error = null;
    render();
    try {
      await api.answerJoinRequest(chat.id, userId, approve);
      requests = requests.filter((r) => r.user.id !== userId);
      notice = approve ? "Участник добавлен" : "Заявка отклонена";
    } catch (err) {
      error = err.message || "Не удалось обработать заявку";
    } finally {
      busy = false;
      render();
    }
  }

  async function discussion(action, groupId) {
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const res = await api.setChatDiscussion(chat.id, action, groupId);
      chat = { ...chat, ...res.chat };
      notice = res.discussion ? `Обсуждение: «${res.discussion.title}»` : "Комментарии отключены";
      onSaved?.(chat);
    } catch (err) {
      error = err.message || "Не удалось изменить обсуждение";
    } finally {
      busy = false;
      render();
    }
  }

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

        // Comments under a channel's posts are just a linked group. It was
        // created with the channel and could never be changed — no way to turn
        // comments off, no way to point at a group people are already in.
        isChannel
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, "Обсуждение"),
              el(
                "p",
                { class: "settings-toggle-hint" },
                chat.linkedDiscussionChatId
                  ? "Под постами есть комментарии — они пишутся в связанной группе."
                  : "Комментарии выключены. Свяжите канал с группой — и под каждым постом появится обсуждение."
              ),
              el("div", { class: "admin-label-grid" }, [
                chat.linkedDiscussionChatId
                  ? el(
                      "button",
                      {
                        class: "admin-label-btn",
                        disabled: busy,
                        onclick: async () => {
                          if (!confirm("Отключить комментарии? Группа обсуждения останется на месте со всей перепиской.")) return;
                          await discussion("unlink");
                        },
                      },
                      "Отключить комментарии"
                    )
                  : el("button", { class: "admin-label-btn", disabled: busy, onclick: () => discussion("create") }, "Создать группу обсуждения"),
                el(
                  "button",
                  {
                    class: "admin-label-btn",
                    disabled: busy,
                    onclick: () =>
                      openChatPickerDialog(
                        (groupId) => discussion("link", groupId),
                        "Какую группу связать с каналом"
                      ),
                  },
                  chat.linkedDiscussionChatId ? "Выбрать другую группу" : "Связать существующую"
                ),
              ]),
            ])
          : null,

        // Who gets in, and how posts are signed.
        el("p", { class: "settings-field-label" }, "Вступление"),
        el("div", { class: "create-chat-public" }, [
          el("div", {}, [
            el("p", { class: "settings-toggle-title" }, "Заявки на вступление"),
            el("p", { class: "settings-toggle-hint" }, "По ссылке будут подавать заявку, а не входить сразу — утёкшая ссылка перестаёт быть пропуском."),
          ]),
          Toggle(!!chat.approveJoins, (v) => saveSetting({ approveJoins: v })),
        ]),
        isChannel
          ? el("div", { class: "create-chat-public" }, [
              el("div", {}, [
                el("p", { class: "settings-toggle-title" }, "Подписывать посты"),
                el("p", { class: "settings-toggle-hint" }, "Под постом будет имя автора. Уже опубликованные не меняются."),
              ]),
              Toggle(!!chat.signMessages, (v) => saveSetting({ signMessages: v })),
            ])
          : null,
        requests.length
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, `Заявки (${requests.length})`),
              ...requests.map((r) =>
                el("div", { class: "settings-device-row" }, [
                  Avatar({ name: r.user.name, color: r.user.avatarColor, image: r.user.avatarImage, size: 32 }),
                  el("div", { class: "settings-device-body" }, [
                    el("p", {}, r.user.name),
                    r.user.username ? el("p", { class: "mono settings-toggle-hint" }, `@${r.user.username}`) : null,
                  ].filter(Boolean)),
                  el("button", { class: "btn-accent-pill", disabled: busy, onclick: () => answer(r.user.id, true) }, "Принять"),
                  el("button", { class: "profile-action-btn danger", disabled: busy, onclick: () => answer(r.user.id, false) }, "Отклонить"),
                ])
              ),
            ])
          : null,

        // Slow mode — the gap a member has to wait between messages. Group
        // only; staff are never held by it.
        !isChannel
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, "Медленный режим"),
              el("p", { class: "settings-toggle-hint" }, "Сколько ждать между сообщениями. Не касается владельцев, админов и модераторов."),
              el(
                "div",
                { class: "admin-label-grid" },
                [
                  { label: "Выкл", seconds: 0 },
                  { label: "10 с", seconds: 10 },
                  { label: "30 с", seconds: 30 },
                  { label: "1 мин", seconds: 60 },
                  { label: "5 мин", seconds: 300 },
                  { label: "15 мин", seconds: 900 },
                ].map((o) =>
                  el(
                    "button",
                    {
                      class: `admin-label-btn ${(chat.slowModeSeconds ?? 0) === o.seconds ? "active" : ""}`,
                      onclick: async () => {
                        try {
                          const res = await api.setSlowMode(chat.id, o.seconds);
                          chat = { ...chat, slowModeSeconds: res.slowModeSeconds };
                          notice = o.seconds ? `Медленный режим: ${o.label}` : "Медленный режим выключен";
                        } catch (err) {
                          error = err.message || "Не удалось изменить";
                        }
                        render();
                      },
                    },
                    o.label
                  )
                )
              ),
            ])
          : null,

        // История канала — на 24 часа в ленте у всех подписчиков, тем же
        // кружком, что и у людей (storiesBar.js её уже умеет рисовать).
        isChannel
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, "История канала"),
              el("p", { class: "settings-toggle-hint" }, "Появится в ленте историй у всех подписчиков на 24 часа."),
              el("button", { class: "btn-accent-pill", disabled: busy || !!storyProgress, onclick: () => storyInput.click() }, storyProgress ?? "Добавить историю"),
              storyInput,
            ])
          : null,

        // Платные комментарии: цену задаёт владелец/админ канала, платит
        // каждый, кто без Premium, звёзды идут владельцу.
        isChannel
          ? el("div", {}, [
              el("p", { class: "settings-field-label" }, "Комментарии за звёзды"),
              el("p", { class: "settings-toggle-hint" }, "Сколько звёзд платит читатель за каждый комментарий под постом. 0 — бесплатно. С Premium — всегда бесплатно."),
              el("div", { class: "stars-price-row" }, [
                commentPriceInput,
                el("button", { class: "btn-accent-pill", disabled: busy, onclick: saveCommentPrice }, "Сохранить"),
              ]),
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
