import { askConfirm } from "./confirmDialog.js";
import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { fileToImageDataUrl, fileToImageUpload } from "../lib/image.js";
import { uploadFile } from "../lib/upload.js";
import { Toggle } from "./toggle.js";
import { Avatar } from "./avatar.js";
import { openChatPickerDialog } from "./chatPickerDialog.js";
import { openStoryEditor } from "./storyEditor.js";
import { ALL_EMOJI } from "../lib/emojiList.js";
import { openAdminLogDialog } from "./adminLogDialog.js";
import { openSideTab, twInputField } from "./twTab.js";
import { showToast } from "./toast.js";

// Редактирование группы/канала — вкладка tweb (AppEditChatTab) в правой колонке:
// аватар, название и описание сверху, ниже разделы-строки, каждый открывает свою вкладку.
const COLORS = { blue: "#2196F3", green: "#4CAF50", grey: "#78909C", orange: "#FB8C00", pink: "#E91E63", purple: "#7E57C2", red: "#F44336" };

function rowIcon(icon, color) {
  return el("span", { class: "tw-row-media", style: `background-color: ${COLORS[color] ?? color}`, html: iconSvg(icon, 20) });
}

function row({ icon, color, title, subtitle, right, onClick, toggle, danger }) {
  const body = [
    icon ? (color ? rowIcon(icon, color) : el("span", { class: "tw-row-icon", html: iconSvg(icon, 24) })) : null,
    el("span", { class: "tw-row-body" }, [
      el("span", { class: "tw-row-title" }, [el("span", { class: "tw-row-title-text" }, title), right != null ? el("span", { class: "tw-row-title-right" }, right) : null]),
      subtitle ? el("span", { class: "tw-row-subtitle" }, subtitle) : null,
    ]),
    toggle ? el("span", { class: "tw-row-right" }, Toggle(!!toggle.checked, () => {})) : null,
  ];
  const cls = `tw-row clickable${danger ? " danger" : ""}`;
  if (toggle) return el("button", { type: "button", class: cls, onclick: () => toggle.onChange(!toggle.checked) }, body);
  return el("button", { type: "button", class: cls, onclick: onClick }, body);
}

function section(name, children, caption) {
  return el("div", { class: "tw-section-group" }, [
    name ? el("p", { class: "tw-section-name" }, name) : null,
    el("div", { class: "tw-section" }, children.filter(Boolean)),
    caption ? el("p", { class: "tw-section-caption" }, caption) : null,
  ]);
}

function radioRows(options, value, onPick) {
  return options.map((o) =>
    el("button", { type: "button", class: `tw-row clickable tw-radio-row${value === o.value ? " selected" : ""}`, onclick: () => onPick(o.value) }, [
      el("span", { class: "tw-radio" }),
      el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, o.label), o.sub ? el("span", { class: "tw-row-subtitle" }, o.sub) : null]),
    ])
  );
}

function userRow(u, actions) {
  return el("div", { class: "tw-row tw-user-row" }, [
    Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 42 }),
    el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, u.name), u.username ? el("span", { class: "tw-row-subtitle" }, `@${u.username}`) : null]),
    ...actions,
  ]);
}

export function openEditChatDialog(chat, onSaved) {
  const isChannel = chat.type === "channel";
  const what = isChannel ? "канал" : "группу";

  let avatarImage = chat.avatarImage ?? null;
  let avatarColor = chat.avatarColor ?? null;
  let colors = [];
  let requests = [];
  let banned = [];
  let permissions = null;
  let permFields = [];
  let inviteLink = chat.inviteCode ? `${window.location.origin}/join/${chat.inviteCode}` : null;

  const toastError = (err, fallback) => showToast(err?.message || fallback);
  const changed = (patch) => {
    chat = { ...chat, ...patch };
    onSaved?.(chat);
    renderMain();
  };

  // --- данные ---
  if (!isChannel) {
    api.getChatPermissions(chat.id).then((res) => {
      permissions = res.permissions;
      permFields = res.fields ?? [];
      renderMain();
    }, () => {});
  }
  api.listJoinRequests(chat.id).then((res) => {
    requests = res.requests ?? [];
    renderMain();
  }, () => {});
  api.listBannedMembers(chat.id).then((res) => {
    banned = res.users ?? [];
    renderMain();
  }, () => {});
  api.getChatFeatures(chat.id).then((res) => {
    colors = res.colors ?? [];
    renderMain();
  }, () => {});

  async function saveSetting(patch) {
    try {
      const { chat: updated } = await api.setChatSettings(chat.id, patch);
      changed(updated);
    } catch (err) {
      toastError(err, "Не удалось сохранить");
    }
  }

  // --- шапка: аватар, название, описание ---
  const name = twInputField({ label: isChannel ? "Название канала" : "Название группы", value: chat.title ?? "", maxLength: 128 });
  const desc = twInputField({ label: "Описание", value: chat.description ?? "", multiline: true, maxLength: 255 });
  const avatarFile = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      avatarImage = await fileToImageDataUrl(file, 512);
      renderAvatar();
    },
  });
  const avatarSlot = el("div", { class: "tw-create-head" });
  function renderAvatar() {
    avatarSlot.replaceChildren(
      el("button", { type: "button", class: "tw-avatar-edit has-image tw-edit-avatar", style: "width:120px;height:120px", title: "Сменить фото", onclick: () => avatarFile.click() }, [
        el("span", { class: "tw-avatar-edit-preview" }, [Avatar({ name: name.input.value || chat.title, color: avatarColor, image: avatarImage, size: 120 })]),
        el("span", { class: "tw-avatar-edit-icon", html: iconSvg("Image", 40) }),
      ]),
      avatarFile
    );
  }
  renderAvatar();

  const mainList = el("div");
  let mainTab = null;

  async function save(tab) {
    const title = name.input.value.trim();
    if (!title) {
      name.field.classList.add("error");
      name.input.focus();
      return;
    }
    // Отправляем только изменённое — иначе сервер пишет в чат «удалил фото», которого не было.
    const patch = {};
    if (title !== (chat.title ?? "")) patch.title = title;
    if (desc.input.value.trim() !== (chat.description ?? "")) patch.description = desc.input.value.trim();
    if (avatarImage !== (chat.avatarImage ?? null)) patch.avatarImage = avatarImage;
    if (avatarColor !== (chat.avatarColor ?? null)) patch.avatarColor = avatarColor;
    if (!Object.keys(patch).length) {
      tab.close({ all: true });
      return;
    }
    tab.setFabBusy(true);
    try {
      const { chat: updated } = await api.patchChat(chat.id, patch);
      chat = { ...chat, ...updated };
      onSaved?.(chat);
      tab.close({ all: true });
      showToast("Сохранено");
    } catch (err) {
      tab.setFabBusy(false);
      toastError(err, "Не удалось сохранить");
    }
  }

  // --- вкладки разделов ---
  function openTypeTab() {
    let isPublic = !!chat.isPublic;
    const handle = twInputField({
      label: "Юзернейм",
      value: chat.username ?? "",
      inputClass: "mono",
      oninput: (e) => (e.target.value = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "")),
    });
    const handleBox = el("div", { class: "tw-section-group" }, [
      el("div", { class: "tw-section tw-section-pad" }, [handle.field]),
      el("p", { class: "tw-section-caption" }, "Латиница, цифры и подчёркивание, от 3 символов."),
    ]);
    const typeBox = el("div");
    const draw = () => {
      typeBox.replaceChildren(
        section(
          isChannel ? "Тип канала" : "Тип группы",
          radioRows(
            [
              { value: false, label: isChannel ? "Частный канал" : "Частная группа", sub: "Вступить можно только по пригласительной ссылке" },
              { value: true, label: isChannel ? "Публичный канал" : "Публичная группа", sub: "Найдут в поиске и откроют по ссылке" },
            ],
            isPublic,
            (v) => {
              isPublic = v;
              draw();
              if (v) handle.input.focus();
            }
          )
        )
      );
      handleBox.hidden = !isPublic;
    };
    draw();
    openSideTab({
      title: isChannel ? "Тип канала" : "Тип группы",
      content: [typeBox, handleBox],
      fab: {
        icon: "Check",
        title: "Сохранить",
        onClick: async (tab) => {
          const username = handle.input.value.trim();
          if (isPublic && username.length < 3) {
            handle.field.classList.add("error");
            return showToast("Ссылка — от 3 символов");
          }
          tab.setFabBusy(true);
          try {
            const res = await api.setChannelPublic(chat.id, isPublic, username);
            changed(res.chat);
            tab.close();
          } catch (err) {
            tab.setFabBusy(false);
            toastError(err, "Не удалось сохранить");
          }
        },
      },
    });
  }

  function openInviteTab() {
    const box = el("div");
    const draw = () =>
      box.replaceChildren(
        el("div", { class: "tw-media-header" }, [
          el("span", { class: "tw-media-sticker", html: iconSvg("Link", 56) }),
          el("p", { class: "tw-media-subtitle" }, `По этой ссылке можно вступить в ${what} без приглашения от администратора.`),
        ]),
        section(
          "Пригласительная ссылка",
          [
            inviteLink
              ? el("button", { type: "button", class: "tw-invite-link", onclick: () => navigator.clipboard?.writeText(inviteLink).then(() => showToast("Ссылка скопирована")) }, [
                  el("span", { class: "tw-invite-link-text mono" }, inviteLink.replace(/^https?:\/\//, "")),
                  el("span", { class: "tw-invite-link-copy", html: iconSvg("Copy", 20) }),
                ])
              : el("p", { class: "tw-empty" }, "Ссылка ещё не создана"),
            el("button", {
              type: "button",
              class: "tw-btn-row",
              onclick: async () => {
                try {
                  const { code } = await api.chatInviteLink(chat.id, !!inviteLink);
                  const had = !!inviteLink;
                  inviteLink = `${window.location.origin}/join/${code}`;
                  chat = { ...chat, inviteCode: code };
                  showToast(had ? "Старая ссылка отозвана, создана новая" : "Ссылка создана");
                  draw();
                } catch (err) {
                  toastError(err, "Не удалось получить ссылку");
                }
              },
            }, [el("span", { class: "tw-btn-row-icon", html: iconSvg(inviteLink ? "X" : "Plus", 24) }), inviteLink ? "Отозвать и создать новую" : "Создать ссылку"]),
          ],
          "Если ссылка попала не туда — отзовите её, старая перестанет работать."
        ),
        section(null, [
          row({ title: "Заявки на вступление", subtitle: "По ссылке подают заявку, а не входят сразу", toggle: { checked: !!chat.approveJoins, onChange: async (v) => { await saveSetting({ approveJoins: v }); draw(); } } }),
        ])
      );
    draw();
    openSideTab({ title: "Пригласительные ссылки", content: [box] });
  }

  function openPermissionsTab() {
    const box = el("div");
    const draw = () =>
      box.replaceChildren(
        section(
          "Что могут участники",
          permFields.map((f) =>
            row({
              title: f.label,
              toggle: {
                checked: permissions[f.id] !== false,
                onChange: async (v) => {
                  const prev = permissions;
                  permissions = { ...permissions, [f.id]: v };
                  draw();
                  try {
                    await api.setChatPermissions(chat.id, permissions);
                  } catch (err) {
                    permissions = prev;
                    draw();
                    toastError(err, "Не удалось сохранить права");
                  }
                },
              },
            })
          ),
          "Не касается владельцев, администраторов и модераторов."
        ),
        section(
          "Медленный режим",
          radioRows(
            [
              { value: 0, label: "Выключен" },
              { value: 10, label: "10 секунд" },
              { value: 30, label: "30 секунд" },
              { value: 60, label: "1 минута" },
              { value: 300, label: "5 минут" },
              { value: 900, label: "15 минут" },
            ],
            chat.slowModeSeconds ?? 0,
            async (seconds) => {
              try {
                const res = await api.setSlowMode(chat.id, seconds);
                chat = { ...chat, slowModeSeconds: res.slowModeSeconds };
                draw();
                renderMain();
              } catch (err) {
                toastError(err, "Не удалось изменить");
              }
            }
          ),
          "Сколько ждать между сообщениями одному участнику."
        ),
        section(null, [
          row({ title: "Анонимные администраторы", subtitle: "Админы пишут от имени группы", toggle: { checked: !!chat.anonymousAdmins, onChange: async (v) => { await saveSetting({ anonymousAdmins: v }); draw(); } } }),
        ])
      );
    draw();
    openSideTab({ title: "Права участников", content: [box] });
  }

  function openReactionsTab() {
    let restricted = Array.isArray(chat.allowedReactions);
    let draft = chat.allowedReactions ? [...chat.allowedReactions] : [];
    const box = el("div");
    const saveReactions = async (next) => {
      try {
        const res = await api.setAllowedReactions(chat.id, next);
        chat = { ...chat, allowedReactions: res.chat.allowedReactions };
        renderMain();
      } catch (err) {
        toastError(err, "Не удалось сохранить");
      }
    };
    const draw = () =>
      box.replaceChildren(
        section(
          "Реакции под постами",
          radioRows(
            [
              { value: false, label: "Все реакции" },
              { value: true, label: "Только выбранные" },
            ],
            restricted,
            (v) => {
              restricted = v;
              saveReactions(v ? draft : null);
              draw();
            }
          )
        ),
        restricted
          ? section(
              `Разрешено: ${draft.length}`,
              [
                el(
                  "div",
                  { class: "edit-chat-reactions-grid tw-reactions-grid" },
                  ALL_EMOJI.map((e) =>
                    el("button", {
                      class: `edit-chat-reaction-btn ${draft.includes(e) ? "active" : ""}`,
                      onclick: () => {
                        draft = draft.includes(e) ? draft.filter((x) => x !== e) : [...draft, e];
                        saveReactions(draft);
                        draw();
                      },
                    }, e)
                  )
                ),
              ]
            )
          : ""
      );
    draw();
    openSideTab({ title: "Реакции", content: [box] });
  }

  function openRequestsTab() {
    const box = el("div");
    const draw = () =>
      box.replaceChildren(
        section(
          null,
          requests.length
            ? requests.map((r) =>
                userRow(r.user, [
                  el("button", { class: "tw-link-btn", onclick: () => answer(r.user.id, true) }, "Принять"),
                  el("button", { class: "icon-btn danger", title: "Отклонить", html: iconSvg("X", 20), onclick: () => answer(r.user.id, false) }),
                ])
              )
            : [el("p", { class: "tw-empty" }, "Новых заявок нет")],
          "Заявки приходят, когда включено «Заявки на вступление»."
        )
      );
    async function answer(userId, approve) {
      try {
        await api.answerJoinRequest(chat.id, userId, approve);
        requests = requests.filter((r) => r.user.id !== userId);
        showToast(approve ? "Участник добавлен" : "Заявка отклонена");
        draw();
        renderMain();
      } catch (err) {
        toastError(err, "Не удалось обработать заявку");
      }
    }
    draw();
    openSideTab({ title: "Заявки на вступление", content: [box] });
  }

  function openBannedTab() {
    const box = el("div");
    const draw = () =>
      box.replaceChildren(
        section(
          null,
          banned.length
            ? banned.map((u) =>
                userRow(u, [
                  el("button", {
                    class: "tw-link-btn",
                    onclick: async () => {
                      try {
                        await api.setMemberRole(chat.id, u.id, "unban");
                        banned = banned.filter((x) => x.id !== u.id);
                        showToast("Пользователь разблокирован");
                        draw();
                        renderMain();
                      } catch (err) {
                        toastError(err, "Не удалось разблокировать");
                      }
                    },
                  }, "Разблокировать"),
                ])
              )
            : [el("p", { class: "tw-empty" }, "Никого не заблокировано")],
          `Заблокированные не могут вернуться в ${what} по ссылке.`
        )
      );
    draw();
    openSideTab({ title: "Заблокированные", content: [box] });
  }

  function openDiscussionTab() {
    const box = el("div");
    const discussion = async (action, groupId) => {
      try {
        const res = await api.setChatDiscussion(chat.id, action, groupId);
        changed(res.chat);
        showToast(res.discussion ? `Обсуждение: «${res.discussion.title}»` : "Комментарии отключены");
        draw();
      } catch (err) {
        toastError(err, "Не удалось изменить обсуждение");
      }
    };
    const draw = () =>
      box.replaceChildren(
        el("div", { class: "tw-media-header" }, [
          el("span", { class: "tw-media-sticker", html: iconSvg("MessageSquare", 56) }),
          el("p", { class: "tw-media-subtitle" }, chat.linkedDiscussionChatId ? "Под постами есть комментарии — они пишутся в связанной группе." : "Свяжите канал с группой — и под каждым постом появятся комментарии."),
        ]),
        section(null, [
          chat.linkedDiscussionChatId
            ? null
            : el("button", { type: "button", class: "tw-btn-row", onclick: () => discussion("create") }, [el("span", { class: "tw-btn-row-icon", html: iconSvg("Plus", 24) }), "Создать группу обсуждения"]),
          el("button", { type: "button", class: "tw-btn-row", onclick: () => openChatPickerDialog((groupId) => discussion("link", groupId), "Какую группу связать с каналом") }, [
            el("span", { class: "tw-btn-row-icon", html: iconSvg("Link", 24) }),
            chat.linkedDiscussionChatId ? "Выбрать другую группу" : "Связать существующую",
          ]),
          chat.linkedDiscussionChatId
            ? el("button", {
                type: "button",
                class: "tw-btn-row danger",
                onclick: async () => {
                  if (!(await askConfirm("Отключить комментарии? Группа обсуждения останется на месте со всей перепиской."))) return;
                  discussion("unlink");
                },
              }, [el("span", { class: "tw-btn-row-icon", html: iconSvg("X", 24) }), "Отключить комментарии"])
            : null,
        ]),
        section("Цена комментария", [
          (() => {
            const price = twInputField({ label: "Звёзд за комментарий (0 — бесплатно)", value: String(chat.commentPriceStars ?? 0) });
            price.input.type = "number";
            price.input.min = "0";
            return el("div", { class: "tw-section-pad" }, [
              price.field,
              el("button", {
                class: "tw-primary-btn tw-inline-btn",
                onclick: async () => {
                  try {
                    const res = await api.setCommentPrice(chat.id, Number(price.input.value));
                    chat = { ...chat, commentPriceStars: res.commentPriceStars };
                    showToast(res.commentPriceStars > 0 ? `Комментарии стоят ${res.commentPriceStars} ⭐` : "Комментарии бесплатны");
                  } catch (err) {
                    toastError(err, "Не удалось сохранить");
                  }
                },
              }, "Сохранить цену"),
            ]);
          })(),
        ], "С Premium читатели комментируют бесплатно.")
      );
    draw();
    openSideTab({ title: "Обсуждение", content: [box] });
  }

  function openWelcomeTab() {
    const text = twInputField({ label: "Текст приветствия", value: chat.welcomeText ?? "", multiline: true, maxLength: 1000 });
    openSideTab({
      title: "Приветствие",
      content: [
        el("div", { class: "tw-media-header" }, [
          el("span", { class: "tw-media-sticker", html: iconSvg("MessageSquare", 56) }),
          el("p", { class: "tw-media-subtitle" }, "Группа сама напишет это каждому новому участнику. {name} заменится на имя."),
        ]),
        el("div", { class: "tw-section-group" }, [el("div", { class: "tw-section tw-section-pad" }, [text.field]), el("p", { class: "tw-section-caption" }, "Оставьте пустым, чтобы выключить приветствие.")]),
      ],
      fab: {
        icon: "Check",
        onClick: async (tab) => {
          tab.setFabBusy(true);
          try {
            const res = await api.setWelcomeText(chat.id, text.input.value);
            chat = { ...chat, welcomeText: res.welcomeText || undefined };
            showToast(res.welcomeText ? "Приветствие сохранено" : "Приветствие выключено");
            renderMain();
            tab.close();
          } catch (err) {
            tab.setFabBusy(false);
            toastError(err, "Не удалось сохранить");
          }
        },
      },
    });
  }

  // История канала
  const storyInput = el("input", { type: "file", accept: "image/*,video/*", class: "hidden-input", multiple: true });
  storyInput.onchange = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    try {
      const items = [];
      for (const [i, file] of files.entries()) {
        const isVideo = file.type.startsWith("video/");
        let upload = file;
        if (!isVideo) {
          const edited = await openStoryEditor(file);
          if (!edited) continue;
          upload = edited === file ? await fileToImageUpload(file, 1080) : edited;
        }
        showToast(`Загружаем ${i + 1} из ${files.length}…`);
        const { url } = await uploadFile(upload, isVideo ? "video" : "image");
        items.push({ kind: isVideo ? "video" : "image", url });
      }
      if (!items.length) return;
      await api.postChannelStory(chat.id, items);
      showToast("История опубликована");
    } catch (err) {
      toastError(err, "Не удалось выложить историю");
    }
  };

  function colorSection() {
    if (!colors.length) return null;
    return section(
      "Цвет",
      [
        el(
          "div",
          { class: "chat-color-grid tw-color-grid" },
          colors.map((c) =>
            el("button", {
              class: `chat-color-swatch ${avatarColor === c.hex ? "active" : ""} ${c.unlocked ? "" : "locked"}`,
              style: { background: c.hex },
              title: c.unlocked ? c.name : `${c.name} — с ${c.level}-го уровня`,
              onclick: () => {
                if (!c.unlocked) return showToast(`Цвет «${c.name}» открывается на ${c.level}-м уровне бустов`);
                avatarColor = c.hex;
                renderAvatar();
                renderMain();
              },
            }, c.unlocked ? null : el("span", { class: "chat-color-lock", html: iconSvg("Lock", 11) }))
          )
        ),
      ],
      "Новые цвета открываются с уровнями бустов."
    );
  }

  function renderMain() {
    mainList.replaceChildren(
      ...[
        section(null, [
          row({ icon: isChannel ? "Send" : "Users", color: "blue", title: isChannel ? "Тип канала" : "Тип группы", right: chat.isPublic ? "Публичный" : "Частный", onClick: openTypeTab }),
          row({ icon: "Link", color: "orange", title: "Пригласительные ссылки", right: chat.approveJoins ? "по заявкам" : null, onClick: openInviteTab }),
          isChannel
            ? row({ icon: "Smile", color: "pink", title: "Реакции", right: Array.isArray(chat.allowedReactions) ? String(chat.allowedReactions.length) : "Все", onClick: openReactionsTab })
            : permissions
              ? row({ icon: "Lock", color: "purple", title: "Права участников", right: chat.slowModeSeconds ? "медленный режим" : null, onClick: openPermissionsTab })
              : null,
          isChannel
            ? row({ icon: "MessageSquare", color: "green", title: "Обсуждение", right: chat.linkedDiscussionChatId ? "Вкл." : "Выкл.", onClick: openDiscussionTab })
            : row({ icon: "MessageSquare", color: "green", title: "Приветствие", right: chat.welcomeText ? "Вкл." : "Выкл.", onClick: openWelcomeTab }),
        ]),
        section(null, [
          isChannel
            ? row({ title: "Подписывать посты", subtitle: "Под постом будет имя автора", toggle: { checked: !!chat.signMessages, onChange: (v) => saveSetting({ signMessages: v }) } })
            : null,
          row({ icon: "User", color: "blue", title: "Заявки на вступление", right: requests.length ? String(requests.length) : null, onClick: openRequestsTab }),
          row({ icon: "Shield", color: "red", title: "Заблокированные", right: banned.length ? String(banned.length) : null, onClick: openBannedTab }),
          row({ icon: "Clock", color: "grey", title: "Недавние действия", onClick: () => openAdminLogDialog(chat) }),
          isChannel ? row({ icon: "Image", color: "purple", title: "Добавить историю канала", onClick: () => storyInput.click() }) : null,
        ]),
        colorSection(),
      ].filter(Boolean)
    );
  }
  renderMain();

  mainTab = openSideTab({
    title: isChannel ? "Изменить канал" : "Изменить группу",
    side: "right",
    content: [
      avatarSlot,
      el("div", { class: "tw-section-group" }, [el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field])]),
      mainList,
      storyInput,
    ],
    fab: { icon: "Check", title: "Сохранить", onClick: save },
  });
  return mainTab;
}
