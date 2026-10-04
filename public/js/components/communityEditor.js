import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openSideTab, twInputField, twAvatarEdit } from "./twTab.js";
import { showToast } from "./toast.js";
import { askConfirm } from "./confirmDialog.js";

// Создание и редактирование сообщества — те же экраны, что в tweb
// (components/communities/createCommunity.tsx и editCommunity.tsx): аватар,
// название, «кто может добавлять чаты», список чатов с видимостью каждого,
// удаление сообщества. «Сохранить» появляется только когда что-то изменилось
// (tweb hasCommunityEditChanges).

const TITLE_MAX = 128;
const ADD_MODES = [
  { value: "all", title: "Все участники", sub: "Любой участник сообщества может добавить свой чат" },
  { value: "admins", title: "Только администраторы", sub: "Добавлять чаты могут только владелец сообщества и администраторы его чатов" },
];

function radioRows(options, selected, onSelect) {
  return el(
    "div",
    { class: "tw-section" },
    options.map((o) =>
      el(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(selected === o.value),
          class: `tw-row clickable tw-radio-row${selected === o.value ? " selected" : ""}`,
          onclick: () => onSelect(o.value),
        },
        [
          el("span", { class: "tw-radio" }),
          el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, o.title), el("span", { class: "tw-row-subtitle" }, o.sub)]),
        ]
      )
    )
  );
}

function sectionGroup(name, ...nodes) {
  return el("div", { class: "tw-section-group" }, [name ? el("p", { class: "tw-section-name" }, name) : null, ...nodes].filter(Boolean));
}

function chatRow(chat, { onClick, onRemove } = {}) {
  const row = el(onClick ? "button" : "div", { type: onClick ? "button" : null, class: "tw-row clickable tw-user-row", onclick: onClick ? () => onClick(chat) : null }, [
    Avatar({ name: chat.title, color: chat.avatarColor, image: chat.avatarImage, size: 42 }),
    el("span", { class: "tw-row-body" }, [
      el("span", { class: "tw-row-title" }, `${chat.type === "channel" ? "📢 " : ""}${chat.title}`),
      el("span", { class: "tw-row-subtitle" }, chat.username ? `@${chat.username}` : `${chat.members ?? 0} участников`),
    ]),
    chat.visible === false ? el("span", { class: "community-hidden-badge" }, "Скрыт") : null,
    onRemove
      ? el("span", {
          class: "icon-btn",
          role: "button",
          title: "Убрать из сообщества",
          html: iconSvg("X", 15),
          onclick: (e) => {
            e.stopPropagation();
            onRemove(chat);
          },
        })
      : null,
  ]);
  return row;
}

// Свои группы и каналы, которые можно добавить в сообщество (владелец или админ).
function ownChats() {
  const { chats, user } = getState();
  return chats.filter(
    (c) =>
      (c.type === "group" || c.type === "channel") &&
      (c.ownerId === user?.id || (c.ownerIds ?? []).includes(user?.id) || (c.adminIds ?? []).includes(user?.id))
  );
}

export function openOwnChatPicker(onPick, { exclude = [] } = {}) {
  const candidates = ownChats().filter((c) => !exclude.includes(c.id));
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const close = () => overlay.remove();
  overlay.appendChild(
    el("div", { class: "modal-dialog" }, [
      el("h2", { class: "modal-title" }, "Добавить чат в сообщество"),
      candidates.length
        ? el(
            "div",
            { class: "forward-list" },
            candidates.map((c) =>
              el("button", { class: "forward-row", onclick: () => (close(), onPick(c.id, c)) }, [
                Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 36 }),
                el("span", {}, `${c.type === "channel" ? "📢 " : ""}${c.title}`),
              ])
            )
          )
        : el("p", { class: "empty-hint" }, "Нет групп и каналов, где вы владелец или администратор"),
      el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
    ])
  );
  document.body.appendChild(overlay);
}

// Видимость чата внутри сообщества (tweb communityChatSettings.tsx). У сообщества,
// которое ещё не создано, настройка только запоминается до отправки формы.
export function openCommunityChatSettings(community, chat, onSaved) {
  let visible = chat.visible !== false;
  const list = el("div", { class: "tw-section" });
  const paint = () =>
    list.replaceChildren(
      radioRows(VISIBLE_OPTIONS, visible, (v) => {
        visible = v;
        paint();
      })
    );

  function save(tab) {
    if (!community?.id) {
      tab.close();
      onSaved?.({ visible });
      return;
    }
    tab.setFabBusy(true);
    api
      .setCommunityChatVisible(community.id, chat.id, visible)
      .then(({ community: updated }) => {
        tab.close();
        onSaved?.(updated);
      })
      .catch((err) => {
        tab.setFabBusy(false);
        showToast(err?.message || "Не удалось сохранить");
      });
  }

  openSideTab({
    title: "Настройки чата",
    content: [
      sectionGroup(null, el("div", { class: "tw-section" }, [chatRow(chat)])),
      sectionGroup("Видимость чата", list, el("p", { class: "tw-section-caption" }, "Скрытый чат остаётся в сообществе, но не показывается в его списке.")),
    ],
    fab: { icon: "Check", title: "Сохранить", onClick: save },
  });
  paint();
}

const VISIBLE_OPTIONS = [
  { value: true, title: "Видимый", sub: "Чат показывается в списке сообщества" },
  { value: false, title: "Скрытый", sub: "Чат есть в сообществе, но не виден в его списке" },
];

// «Новое сообщество» — как в tweb createCommunity.tsx.
export function openCreateCommunityDialog({ firstChatId = null, firstChat = null, onCreated } = {}) {
  let addMode = "all";
  let visible = true;
  const avatar = twAvatarEdit();
  const name = twInputField({ label: "Название сообщества", maxLength: TITLE_MAX });
  const desc = twInputField({ label: "Описание (необязательно)", multiline: true, maxLength: 255 });
  const modeList = el("div");
  const chatsList = el("div", { class: "tw-section" });
  const chatsName = el("p", { class: "tw-section-name" });

  const paint = () => {
    modeList.replaceChildren(radioRows(ADD_MODES, addMode, (v) => {
      addMode = v;
      paint();
    }));
    chatsList.replaceChildren(
      firstChatId
        ? chatRow({ ...firstChat, id: firstChatId, visible }, {
            onClick: () => openCommunityChatSettings({ id: null }, { ...firstChat, id: firstChatId, visible }, (updated) => (visible = updated.visible)),
          })
        : el("p", { class: "tw-section-caption tw-section-empty" }, "После создания можно добавить свои группы и каналы.")
    );
    chatsName.textContent = firstChatId ? "Чатов: 1" : "Чатов: 0";
  };
  paint();

  openSideTab({
    title: "Новое сообщество",
    content: [
      el("div", { class: "tw-create-head" }, [avatar.element]),
      sectionGroup(null, el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field]), el("p", { class: "tw-section-caption" }, "Название, фото и описание сообщества видят все участники.")),
      sectionGroup("Кто может добавлять чаты", modeList),
      sectionGroup(null, chatsName, chatsList),
    ],
    fab: {
      icon: "Check",
      title: "Создать",
      onClick: async (tab) => {
        const title = name.input.value.trim();
        if (!title) {
          name.field.classList.add("error");
          name.input.focus();
          return;
        }
        tab.setFabBusy(true);
        try {
          const { community } = await api.createCommunity({
            title,
            description: desc.input.value.trim(),
            avatarImage: avatar.image ?? null,
            addMode,
            ...(firstChatId ? { chatId: firstChatId, chatVisible: visible } : {}),
          });
          tab.close({ all: true });
          onCreated?.(community);
        } catch (err) {
          tab.setFabBusy(false);
          showToast(err?.message || "Не удалось создать сообщество");
        }
      },
    },
  });
}

// «Изменить сообщество» — как в tweb editCommunity.tsx.
export function openEditCommunityDialog(community, onSaved) {
  const saved = {
    title: community.title ?? "",
    description: community.description ?? "",
    addMode: community.addMode ?? "all",
    avatarImage: community.avatarImage ?? null,
  };
  const chats = community.chats ?? [];
  let addMode = saved.addMode;
  let saving = false;

  const avatar = twAvatarEdit({ initial: saved.avatarImage });
  const name = twInputField({ label: "Название сообщества", value: saved.title, maxLength: TITLE_MAX });
  const desc = twInputField({ label: "Описание (необязательно)", value: saved.description, multiline: true, maxLength: 255 });
  const modeList = el("div");
  const chatsList = el("div", { class: "tw-section" });
  const chatsName = el("p", { class: "tw-section-name" }, `Чатов: ${chats.length}`);

  // tweb hasCommunityEditChanges: кнопка появляется, только когда что-то изменилось.
  const isDirty = () => name.input.value.trim() !== saved.title || desc.input.value.trim() !== saved.description || addMode !== saved.addMode || (avatar.image ?? null) !== saved.avatarImage;

  const members = chats.reduce((n, c) => n + (c.members ?? 0), 0);

  function paint() {
    modeList.replaceChildren(radioRows(ADD_MODES, addMode, (v) => {
      addMode = v;
      paint();
      syncFab();
    }));
    chatsList.replaceChildren(
      ...(chats.length
        ? chats.map((chat) =>
            chatRow(chat, {
              onClick: () => openCommunityChatSettings(community, chat, (updated) => {
                Object.assign(community, updated);
                applyChats(updated);
                onSaved?.(updated);
              }),
              onRemove: removeChat,
            })
          )
        : [el("p", { class: "tw-section-caption tw-section-empty" }, "Добавьте свои группы и каналы — они появятся здесь.")])
    );
  }

  function applyChats(updated) {
    chats.length = 0;
    chats.push(...(updated.chats ?? []));
    chatsName.textContent = `Чатов: ${chats.length}`;
  }

  async function removeChat(chat) {
    if (!(await askConfirm(`Убрать «${chat.title}» из сообщества?`))) return;
    try {
      const { community: updated } = await api.removeCommunityChat(community.id, chat.id);
      applyChats(updated);
      paint();
      onSaved?.(updated);
    } catch (err) {
      showToast(err?.message || "Не удалось убрать чат");
    }
  }

  function addChat() {
    openOwnChatPicker(async (chatId) => {
      try {
        const { community: updated } = await api.addCommunityChat(community.id, chatId);
        applyChats(updated);
        paint();
        onSaved?.(updated);
      } catch (err) {
        showToast(err?.message || "Не удалось добавить чат");
      }
    }, { exclude: chats.map((c) => c.id) });
  }

  const tab = openSideTab({
    title: "Изменить сообщество",
    content: [],
    fab: {
      icon: "Check",
      title: "Сохранить",
      onClick: async (t) => {
        const title = name.input.value.trim();
        if (!title) {
          name.field.classList.add("error");
          name.input.focus();
          return;
        }
        if (saving) return;
        saving = true;
        t.setFabBusy(true);
        try {
          const { community: updated } = await api.updateCommunity(community.id, {
            title,
            description: desc.input.value.trim(),
            avatarImage: avatar.image ?? null,
            addMode,
          });
          saved.title = title;
          saved.description = desc.input.value.trim();
          saved.addMode = addMode;
          saved.avatarImage = avatar.image ?? null;
          t.close();
          onSaved?.(updated);
        } catch (err) {
          t.setFabBusy(false);
          showToast(err?.message || "Не удалось сохранить");
        } finally {
          saving = false;
        }
      },
    },
  });

  const syncFab = () => tab.setFabVisible(isDirty());
  name.input.addEventListener("input", syncFab);
  desc.input.addEventListener("input", syncFab);
  avatar.element.querySelector("input[type=file]")?.addEventListener("change", () => setTimeout(syncFab, 0));

  tab.setContent([
    el("div", { class: "tw-create-head" }, [avatar.element]),
    sectionGroup(null, el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field]), el("p", { class: "tw-section-caption" }, "Название, фото и описание сообщества видят все участники.")),
    sectionGroup("Кто может добавлять чаты", modeList),
    members ? sectionGroup(null, el("div", { class: "tw-section" }, [row("Участники", members)])) : null,
    sectionGroup(null, chatsName, el("div", { class: "tw-section" }, [row("Добавить чат", null, { icon: "Plus", onClick: addChat })]), chatsList),
    el("div", { class: "tw-section-group" }, [
      el("div", { class: "tw-section tw-section-pad" }, [
        el("button", {
          type: "button",
          class: "tw-danger-btn",
          onclick: async (e) => {
            const btn = e.currentTarget;
            if (!(await askConfirm(`Удалить сообщество «${community.title}»? Сами группы и каналы останутся.`))) return;
            btn.disabled = true;
            try {
              await api.deleteCommunity(community.id);
              tab.close({ all: true });
              api.joinedCommunities().then(({ communities }) => setState({ communities }), () => {});
              navigate("/");
            } catch (err) {
              btn.disabled = false;
              showToast(err?.message || "Не удалось удалить");
            }
          },
        }, [el("span", { html: iconSvg("Trash", 18) }), " Удалить сообщество"]),
      ]),
    ]),
  ]);

  paint();
  syncFab();
}

function row(title, right, { icon, onClick } = {}) {
  return el(onClick ? "button" : "div", { type: onClick ? "button" : null, class: onClick ? "tw-row clickable" : "tw-row", onclick: onClick ?? null }, [
    icon ? el("span", { class: "tw-row-icon", html: iconSvg(icon, 20) }) : null,
    el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, title)]),
    right != null ? el("span", { class: "tw-row-right" }, String(right)) : null,
  ].filter(Boolean));
}