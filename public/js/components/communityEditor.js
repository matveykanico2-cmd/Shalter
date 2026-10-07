import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openSideTab, twInputField, twAvatarEdit } from "./twTab.js";
import { showToast } from "./toast.js";
import { askConfirm } from "./confirmDialog.js";
import { Toggle } from "./toggle.js";

// Экраны сообществ — как в tweb (components/communities): создание, редактирование
// (editCommunity.tsx), настройки чата в сообществе (communityChatSettings.tsx),
// администраторы и их права, удалённые участники, заявки на добавление чатов
// (communityPendingRequests.tsx), а также общие действия «убрать чат», «покинуть»
// и «удалить», чтобы формулировки и обработка ошибок не расходились по местам вызова.

const TITLE_MAX = 128;
const ADD_MODES = [
  { value: "all", title: "Все участники", sub: "Участники могут сами добавлять свои группы и каналы в сообщество." },
  { value: "admins", title: "Только администраторы", sub: "Чаты, предложенные участниками, добавляются после одобрения администратором." },
];
const VISIBLE_OPTIONS = [
  { value: true, title: "Видимый", sub: "Чат видят все участники сообщества." },
  { value: false, title: "Скрытый", sub: "Чат видят только его участники и администраторы сообщества." },
];
const RIGHTS = [
  { key: "editInfo", title: "Изменение информации", sub: "Название, описание и фото сообщества" },
  { key: "editChats", title: "Изменение списка чатов", sub: "Добавлять, скрывать и убирать чаты, рассматривать заявки" },
  { key: "ban", title: "Удаление участников", sub: "Удалять пользователей из сообщества" },
  { key: "addAdmins", title: "Назначение администраторов", sub: "Добавлять новых администраторов" },
];

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const membersLabel = (c) =>
  `${c.members ?? 0} ${c.type === "channel" ? plural(c.members ?? 0, "подписчик", "подписчика", "подписчиков") : plural(c.members ?? 0, "участник", "участника", "участников")}`;
const kindWord = (chat) => (chat?.type === "channel" ? "канал" : "группу");

// Перечитать строки сообществ в списке чатов (после любого изменения).
export function refreshCommunities() {
  return api.joinedCommunities().then(({ communities }) => setState({ communities }), () => {});
}

// ---------- примитивы ----------

function radioRows(options, selected, onSelect, { disabled = false } = {}) {
  return el(
    "div",
    { class: "tw-section", role: "radiogroup" },
    options.map((o) =>
      el(
        "button",
        {
          type: "button",
          role: "radio",
          disabled: disabled || null,
          "aria-checked": String(selected === o.value),
          class: `tw-row clickable tw-radio-row${selected === o.value ? " selected" : ""}`,
          onclick: () => onSelect(o.value),
        },
        [el("span", { class: "tw-radio" }), el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, o.title), el("span", { class: "tw-row-subtitle" }, o.sub)])]
      )
    )
  );
}

function sectionGroup(name, ...nodes) {
  return el("div", { class: "tw-section-group" }, [name ? el("p", { class: "tw-section-name" }, name) : null, ...nodes].filter(Boolean));
}

function row(title, right, { icon, onClick, danger, accent, subtitle } = {}) {
  return el(
    onClick ? "button" : "div",
    { type: onClick ? "button" : null, class: `tw-row${onClick ? " clickable" : ""}${danger ? " danger" : ""}${accent ? " accent" : ""}`, onclick: onClick ?? null },
    [
      icon ? el("span", { class: "tw-row-icon", html: iconSvg(icon, 20) }) : null,
      el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, title), subtitle ? el("span", { class: "tw-row-subtitle" }, subtitle) : null]),
      right != null ? el("span", { class: "tw-row-right" }, String(right)) : null,
    ].filter(Boolean)
  );
}

function chatRow(chat, { onClick, onRemove, right } = {}) {
  return el(onClick ? "button" : "div", { type: onClick ? "button" : null, class: "tw-row clickable tw-user-row community-chat-item", onclick: onClick ? () => onClick(chat) : null }, [
    Avatar({ name: chat.title, color: chat.avatarColor, image: chat.avatarImage, size: 42 }),
    el("span", { class: "tw-row-body" }, [
      el("span", { class: "tw-row-title" }, [
        chat.type === "channel" ? el("span", { class: "community-chat-kind", html: iconSvg("Megaphone", 14) }) : null,
        chat.title,
        chat.visible === false ? el("span", { class: "community-hidden-icon", title: "Скрытый чат", html: iconSvg("EyeOff", 14) }) : null,
      ]),
      el("span", { class: "tw-row-subtitle" }, chat.username ? `@${chat.username} · ${membersLabel(chat)}` : membersLabel(chat)),
    ]),
    right ?? null,
    onRemove
      ? el("span", {
          class: "icon-btn community-remove-btn",
          role: "button",
          tabindex: "0",
          title: "Убрать из сообщества",
          "aria-label": `Убрать «${chat.title}» из сообщества`,
          html: iconSvg("X", 16),
          onclick: (e) => {
            e.stopPropagation();
            onRemove(chat);
          },
        })
      : null,
  ]);
}

function userRow(user, { subtitle, right, onClick } = {}) {
  return el(onClick ? "button" : "div", { type: onClick ? "button" : null, class: "tw-row clickable tw-user-row", onclick: onClick ?? null }, [
    Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 42 }),
    el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, user.name ?? "Пользователь"), subtitle ? el("span", { class: "tw-row-subtitle" }, subtitle) : null]),
    right ?? null,
  ]);
}

const empty = (text) => el("p", { class: "tw-section-caption tw-section-empty" }, text);

// ---------- общие действия ----------

// Убрать чат из сообщества с подтверждением. true — убран.
export async function removeChatFromCommunity(community, chat) {
  if (!(await askConfirm(`Убрать «${chat.title}» из сообщества «${community.title}»? Сам чат и его участники останутся.`, { okLabel: "Убрать", danger: true }))) return false;
  try {
    await api.removeCommunityChat(community.id, chat.id);
    showToast(chat.type === "channel" ? "Канал убран из сообщества" : "Группа убрана из сообщества");
    refreshCommunities();
    return true;
  } catch (err) {
    showToast(err?.message || "Не удалось убрать чат");
    return false;
  }
}

export async function leaveCommunity(community) {
  if (!(await askConfirm(`Покинуть сообщество «${community.title}»? Вы останетесь во всех его чатах, но они будут показываться отдельно.`, { okLabel: "Покинуть", danger: true }))) return false;
  try {
    await api.leaveCommunity(community.id);
    if (getState().sidebarCommunity === community.id) setState({ sidebarCommunity: null });
    await refreshCommunities();
    return true;
  } catch (err) {
    showToast(err?.message || "Не удалось покинуть сообщество");
    return false;
  }
}

export async function deleteCommunity(community) {
  if (!(await askConfirm(`Удалить сообщество «${community.title}»? Это нельзя отменить. Сами группы и каналы останутся.`, { okLabel: "Удалить", danger: true }))) return false;
  try {
    await api.deleteCommunity(community.id);
    if (getState().sidebarCommunity === community.id) setState({ sidebarCommunity: null });
    showToast("Сообщество удалено");
    await refreshCommunities();
    return true;
  } catch (err) {
    showToast(err?.message || "Не удалось удалить сообщество");
    return false;
  }
}

// Добавить свой чат: сразу или заявкой (режим «только админы»).
export async function addChatToCommunity(community, chat, visible = true) {
  try {
    const res = await api.addCommunityChat(community.id, chat.id, visible);
    showToast(res.requested ? "Заявка отправлена администраторам сообщества" : chat.type === "channel" ? "Канал добавлен в сообщество" : "Группа добавлена в сообщество");
    refreshCommunities();
    return res;
  } catch (err) {
    showToast(err?.message || "Не удалось добавить чат");
    return null;
  }
}

// ---------- выбор своего чата ----------

// Свои группы и каналы (владелец или админ), ещё не входящие в сообщество.
function ownChats(exclude) {
  const { chats, user, communities } = getState();
  const taken = new Set((communities ?? []).flatMap((c) => c.chatIds));
  return chats.filter(
    (c) =>
      (c.type === "group" || c.type === "channel") &&
      !c.secret &&
      !exclude.includes(c.id) &&
      !taken.has(c.id) &&
      (c.ownerId === user?.id || (c.ownerIds ?? []).includes(user?.id) || (c.adminIds ?? []).includes(user?.id))
  );
}

export function openOwnChatPicker(onPick, { exclude = [], title = "Добавить чат в сообщество", hint } = {}) {
  const candidates = ownChats(exclude);
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const close = () => overlay.remove();
  overlay.appendChild(
    el("div", { class: "modal-dialog" }, [
      el("h2", { class: "modal-title" }, title),
      hint ? el("p", { class: "settings-toggle-hint" }, hint) : null,
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
        : el("p", { class: "empty-hint" }, "Нет групп и каналов, которые можно добавить: нужен чат, где вы владелец или администратор и который ещё не входит в сообщество."),
      el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
    ])
  );
  document.body.appendChild(overlay);
}

// Добавление с выбором видимости — tweb: AddChatToCommunity → CommunityChatSettings(mode: "add").
export function openAddChatFlow(community, onDone) {
  const suggest = community.addPolicy === "suggest";
  openOwnChatPicker(
    (chatId, chat) => {
      openCommunityChatSettings(community, { ...chat, id: chatId, members: (chat.memberIds ?? []).length || chat.members }, onDone, { mode: "add" });
    },
    {
      exclude: (community.chats ?? []).map((c) => c.id),
      hint: suggest ? "Чат появится в сообществе после одобрения администратором." : null,
    }
  );
}

// ---------- настройки чата в сообществе ----------

// mode "add" — выбор видимости перед добавлением; иначе — видимость существующего
// чата и кнопка «Убрать из сообщества». У ещё не созданного сообщества (id null)
// выбор только запоминается.
export function openCommunityChatSettings(community, chat, onSaved, { mode = "settings" } = {}) {
  let visible = chat.visible !== false;
  const canEdit = mode === "add" || !community?.id || !!community.rights?.editChats;
  const list = el("div");
  const paint = () =>
    list.replaceChildren(
      radioRows(VISIBLE_OPTIONS, visible, (v) => {
        visible = v;
        paint();
      }, { disabled: !canEdit })
    );

  async function save(tab) {
    if (!community?.id) {
      tab.close();
      onSaved?.({ visible });
      return;
    }
    tab.setFabBusy(true);
    if (mode === "add") {
      const res = await addChatToCommunity(community, chat, visible);
      tab.setFabBusy(false);
      if (!res) return;
      tab.close();
      onSaved?.(res.community);
      return;
    }
    try {
      const { community: updated } = await api.setCommunityChatVisible(community.id, chat.id, visible);
      tab.close();
      refreshCommunities();
      onSaved?.(updated);
    } catch (err) {
      tab.setFabBusy(false);
      showToast(err?.message || "Не удалось сохранить");
    }
  }

  const canRemove = mode !== "add" && community?.id && (community.rights?.editChats || chat.isChatAdmin);
  const tab = openSideTab({
    title: mode === "add" ? "Добавить в сообщество" : "Чат в сообществе",
    content: [
      sectionGroup(null, el("div", { class: "tw-section" }, [chatRow(chat)])),
      sectionGroup("Видимость чата", list),
      mode === "add" && community?.addPolicy === "suggest"
        ? el("p", { class: "tw-section-caption" }, `Если администратор сообщества одобрит заявку, участники этого чата смогут вступать в другие чаты сообщества.`)
        : null,
      canRemove
        ? sectionGroup(
            null,
            el("div", { class: "tw-section" }, [
              row(chat.type === "channel" ? "Убрать канал из сообщества" : "Убрать группу из сообщества", null, {
                icon: "Trash",
                danger: true,
                onClick: async () => {
                  if (await removeChatFromCommunity(community, chat)) {
                    tab.close();
                    onSaved?.(null);
                  }
                },
              }),
            ])
          )
        : null,
    ],
    fab: canEdit ? { icon: "Check", title: mode === "add" ? "Добавить" : "Сохранить", onClick: save } : null,
  });
  paint();
  return tab;
}

// ---------- создание ----------

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
    modeList.replaceChildren(radioRows(ADD_MODES, addMode, (v) => ((addMode = v), paint())));
    chatsList.replaceChildren(
      firstChatId
        ? chatRow({ ...firstChat, id: firstChatId, visible }, {
            onClick: () => openCommunityChatSettings({ id: null }, { ...firstChat, id: firstChatId, visible }, (updated) => ((visible = updated.visible), paint())),
          })
        : empty("После создания можно добавить свои группы и каналы.")
    );
    chatsName.textContent = firstChatId ? "1 чат" : "Чатов пока нет";
  };
  paint();

  openSideTab({
    title: "Новое сообщество",
    content: [
      el("div", { class: "tw-create-head" }, [avatar.element]),
      sectionGroup(null, el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field]), el("p", { class: "tw-section-caption" }, "Сообщество объединяет несколько групп и каналов под одной вывеской.")),
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
          showToast("Сообщество создано");
          await refreshCommunities();
          onCreated?.(community);
        } catch (err) {
          tab.setFabBusy(false);
          showToast(err?.message || "Не удалось создать сообщество");
        }
      },
    },
  });
}

// ---------- редактирование ----------

// Принимает id или любой объект с id — полные данные (чаты, права, счётчики)
// всегда берутся с сервера, иначе экран открывался без списка чатов.
export async function openEditCommunityDialog(communityOrId, onSaved) {
  const id = typeof communityOrId === "string" ? communityOrId : communityOrId.id;
  const tab = openSideTab({ title: "Сообщество", content: [el("p", { class: "empty-hint" }, "Загрузка…")], fab: { icon: "Check", title: "Сохранить", onClick: () => save() } });
  tab.setFabVisible(false);

  let community;
  try {
    ({ community } = await api.getCommunity(id));
  } catch (err) {
    tab.setContent([el("p", { class: "empty-hint" }, err?.message || "Не удалось загрузить сообщество")]);
    return;
  }

  const rights = community.rights ?? {};
  const saved = { title: community.title ?? "", description: community.description ?? "", addMode: community.addMode ?? "all", avatarImage: community.avatarImage ?? null };
  let addMode = saved.addMode;
  let saving = false;

  const avatar = twAvatarEdit({ initial: saved.avatarImage, onChange: () => syncFab() });
  const name = twInputField({ label: "Название сообщества", value: saved.title, maxLength: TITLE_MAX, oninput: () => syncFab() });
  const desc = twInputField({ label: "Описание (необязательно)", value: saved.description, multiline: true, maxLength: 255, oninput: () => syncFab() });
  if (!rights.editInfo) {
    name.input.disabled = true;
    desc.input.disabled = true;
  }
  const modeList = el("div");
  const manageBox = el("div", { class: "tw-section" });
  const chatsBox = el("div");

  // tweb hasCommunityEditChanges: кнопка появляется, только когда что-то изменилось.
  const isDirty = () =>
    (rights.editInfo && (name.input.value.trim() !== saved.title || desc.input.value.trim() !== saved.description || (avatar.image ?? null) !== saved.avatarImage)) ||
    (rights.editChats && addMode !== saved.addMode);
  const syncFab = () => tab.setFabVisible(isDirty());

  async function reload() {
    try {
      ({ community } = await api.getCommunity(id));
      paint();
      onSaved?.(community);
    } catch {}
  }

  async function save() {
    const title = name.input.value.trim();
    if (!title) {
      name.field.classList.add("error");
      name.input.focus();
      return;
    }
    if (saving) return;
    saving = true;
    tab.setFabBusy(true);
    const patch = {};
    if (rights.editInfo) Object.assign(patch, { title, description: desc.input.value.trim(), avatarImage: avatar.image ?? null });
    if (rights.editChats) patch.addMode = addMode;
    try {
      const { community: updated } = await api.updateCommunity(community.id, patch);
      community = updated;
      Object.assign(saved, { title, description: desc.input.value.trim(), addMode, avatarImage: avatar.image ?? null });
      tab.close();
      refreshCommunities();
      onSaved?.(updated);
    } catch (err) {
      tab.setFabBusy(false);
      showToast(err?.message || "Не удалось сохранить");
    } finally {
      saving = false;
    }
  }

  function paint() {
    modeList.replaceChildren(rights.editChats ? sectionGroup("Кто может добавлять чаты", radioRows(ADD_MODES, addMode, (v) => ((addMode = v), paint(), syncFab()))) : "");
    manageBox.replaceChildren(
      ...[
        row("Администраторы", community.adminsCount, { icon: "Shield", onClick: () => openCommunityAdmins(community, reload) }),
        rights.editChats && community.requestsCount
          ? row("Заявки на добавление", community.requestsCount, { icon: "Inbox", accent: true, onClick: () => openCommunityRequests(community, reload) })
          : null,
        rights.ban ? row("Удалённые пользователи", community.bannedCount, { icon: "UserX", onClick: () => openCommunityBans(community, reload) }) : null,
        row("Участники", community.membersCount, { icon: "Users" }),
      ].filter(Boolean)
    );
    const chats = community.chats ?? [];
    chatsBox.replaceChildren(
      sectionGroup(
        `${chats.length} ${plural(chats.length, "чат", "чата", "чатов")}`,
        el("div", { class: "tw-section" }, [
          community.addPolicy ? row(community.addPolicy === "suggest" ? "Предложить чат" : "Добавить чат", null, { icon: "Plus", accent: true, onClick: () => openAddChatFlow(community, reload) }) : null,
          ...(chats.length
            ? chats.map((chat) =>
                chatRow(chat, {
                  onClick: () => openCommunityChatSettings(community, chat, reload),
                  onRemove: rights.editChats || chat.isChatAdmin ? async (c) => (await removeChatFromCommunity(community, c)) && reload() : null,
                })
              )
            : [empty("Добавьте группы и каналы — они появятся здесь.")]),
        ].filter(Boolean))
      )
    );
  }

  tab.setTitle(rights.editInfo || rights.editChats ? "Изменить сообщество" : "Сообщество");
  tab.setContent([
    el("div", { class: "tw-create-head" }, [rights.editInfo ? avatar.element : Avatar({ name: community.title, color: community.avatarColor, image: community.avatarImage, size: 120 })]),
    sectionGroup(null, el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field])),
    modeList,
    sectionGroup(null, manageBox),
    chatsBox,
    el("div", { class: "tw-section-group" }, [
      el("div", { class: "tw-section tw-section-pad" }, [
        community.isOwner
          ? el("button", { type: "button", class: "tw-danger-btn", onclick: async () => (await deleteCommunity(community)) && (tab.close({ all: true }), navigate("/")) }, [
              el("span", { html: iconSvg("Trash", 18) }),
              " Удалить сообщество",
            ])
          : el("button", { type: "button", class: "tw-danger-btn", onclick: async () => (await leaveCommunity(community)) && tab.close({ all: true }) }, [
              el("span", { html: iconSvg("LogOut", 18) }),
              " Покинуть сообщество",
            ]),
      ]),
    ]),
  ]);
  paint();
  syncFab();
}

// ---------- администраторы ----------

export function openCommunityAdmins(community, onChanged) {
  const list = el("div", { class: "tw-section" }, [empty("Загрузка…")]);
  const canAdd = !!community.rights?.addAdmins;
  const meId = getState().user?.id;

  async function load() {
    try {
      const { admins } = await api.communityAdmins(community.id);
      list.replaceChildren(
        ...[
          canAdd ? row("Добавить администратора", null, { icon: "UserPlus", accent: true, onClick: () => pickAdmin() }) : null,
          ...admins.map((a) =>
            userRow(a, {
              subtitle: a.role === "owner" ? "Владелец" : rightsSummary(a.rights),
              onClick: a.role !== "owner" && (canAdd || a.id === meId) ? () => openAdminRights(community, a, a.rights, done) : null,
            })
          ),
        ].filter(Boolean)
      );
    } catch (err) {
      list.replaceChildren(empty(err?.message || "Не удалось загрузить"));
    }
  }
  const done = () => (load(), onChanged?.());

  function pickAdmin() {
    openCommunityMemberPicker(community, {
      title: "Новый администратор",
      filter: (u) => u.role === "member",
      onPick: (u) => openAdminRights(community, u, null, done),
    });
  }

  openSideTab({
    title: "Администраторы",
    content: [sectionGroup(null, list), el("p", { class: "tw-section-caption" }, "Администраторы помогают управлять сообществом. Права каждого настраиваются отдельно.")],
  });
  load();
}

function rightsSummary(rights) {
  const on = RIGHTS.filter((r) => rights?.[r.key]);
  if (on.length === RIGHTS.length) return "Все права";
  return on.length ? on.map((r) => r.title.toLowerCase()).join(", ") : "Без прав";
}

function openAdminRights(community, user, current, onDone) {
  const mine = community.rights ?? {};
  const rights = { ...(current ?? { editInfo: true, editChats: true, ban: true, addAdmins: false }) };
  for (const r of RIGHTS) if (!mine[r.key]) rights[r.key] = false;
  const list = el("div", { class: "tw-section" });
  const paint = () =>
    list.replaceChildren(
      ...RIGHTS.map((r) =>
        el("div", { class: "tw-row" }, [
          el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, r.title), el("span", { class: "tw-row-subtitle" }, r.sub)]),
          el("span", { class: "tw-row-right" }, [Toggle(!!rights[r.key], (v) => ((rights[r.key] = v), paint()), { disabled: !mine[r.key] })]),
        ])
      )
    );
  paint();

  const tab = openSideTab({
    title: current ? "Права администратора" : "Новый администратор",
    content: [
      sectionGroup(null, el("div", { class: "tw-section" }, [userRow(user)])),
      sectionGroup("Что может этот администратор", list),
      current
        ? sectionGroup(
            null,
            el("div", { class: "tw-section" }, [
              row("Снять с должности", null, {
                icon: "ShieldOff",
                danger: true,
                onClick: async () => {
                  if (!(await askConfirm(`Снять ${user.name} с должности администратора сообщества?`, { okLabel: "Снять", danger: true }))) return;
                  try {
                    await api.removeCommunityAdmin(community.id, user.id);
                    tab.close();
                    onDone?.();
                  } catch (err) {
                    showToast(err?.message || "Не удалось снять администратора");
                  }
                },
              }),
            ])
          )
        : null,
    ],
    fab: mine.addAdmins
      ? {
          icon: "Check",
          title: "Сохранить",
          onClick: async (t) => {
            t.setFabBusy(true);
            try {
              await api.setCommunityAdmin(community.id, user.id, rights);
              showToast(current ? "Права сохранены" : `${user.name} теперь администратор`);
              t.close();
              onDone?.();
            } catch (err) {
              t.setFabBusy(false);
              showToast(err?.message || "Не удалось сохранить");
            }
          },
        }
      : null,
  });
}

// Выбор участника сообщества с поиском.
export function openCommunityMemberPicker(community, { title, filter = () => true, onPick }) {
  const list = el("div", { class: "tw-section" }, [empty("Загрузка…")]);
  let timer = null;
  let seq = 0;
  async function load(q) {
    const my = ++seq;
    try {
      const { users } = await api.communityMembers(community.id, q);
      if (my !== seq) return;
      const meId = getState().user?.id;
      const shown = users.filter((u) => u.id !== meId && filter(u));
      list.replaceChildren(
        ...(shown.length
          ? shown.map((u) => userRow(u, { subtitle: u.username ? `@${u.username}` : null, onClick: () => (tab.close(), onPick(u)) }))
          : [empty(q ? "Никого не нашлось" : "Подходящих участников нет")])
      );
    } catch (err) {
      list.replaceChildren(empty(err?.message || "Не удалось загрузить участников"));
    }
  }
  const search = twInputField({
    label: "Поиск участников",
    oninput: (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => load(e.target.value.trim()), 250);
    },
  });
  const tab = openSideTab({ title, content: [sectionGroup(null, el("div", { class: "tw-section tw-section-pad" }, [search.field])), sectionGroup(null, list)] });
  load("");
}

// ---------- удалённые пользователи ----------

export function openCommunityBans(community, onChanged) {
  const list = el("div", { class: "tw-section" }, [empty("Загрузка…")]);

  async function load() {
    try {
      const { users } = await api.communityBans(community.id);
      list.replaceChildren(
        row("Удалить пользователя", null, { icon: "UserX", danger: true, onClick: pick }),
        ...(users.length
          ? users.map((u) =>
              userRow(u, {
                subtitle: `Удалён ${new Date(u.bannedAt).toLocaleDateString("ru-RU")}`,
                right: el("button", {
                  type: "button",
                  class: "community-join-btn secondary",
                  onclick: async (e) => {
                    e.stopPropagation();
                    try {
                      await api.unbanFromCommunity(community.id, u.id);
                      showToast(`${u.name} может снова вступить в сообщество`);
                      done();
                    } catch (err) {
                      showToast(err?.message || "Не удалось разблокировать");
                    }
                  },
                }, "Вернуть"),
              })
            )
          : [empty("Удалённых пользователей нет")])
      );
    } catch (err) {
      list.replaceChildren(empty(err?.message || "Не удалось загрузить"));
    }
  }
  const done = () => (load(), onChanged?.());

  function pick() {
    const isOwner = community.isOwner;
    openCommunityMemberPicker(community, {
      title: "Удалить из сообщества",
      filter: (u) => u.role !== "owner" && (isOwner || u.role !== "admin"),
      onPick: (u) => banUser(community, u, done),
    });
  }

  openSideTab({
    title: "Удалённые пользователи",
    content: [sectionGroup(null, list), el("p", { class: "tw-section-caption" }, "Удалённые пользователи не видят сообщество и не могут вернуться в него, пока вы их не разблокируете. Из самих чатов они не удаляются.")],
  });
  load();
}

export async function banUser(community, user, onDone) {
  let owned = [];
  try {
    ({ chats: owned } = await api.communityBanPreview(community.id, user.id));
  } catch {}
  const warning = owned.length
    ? ` Вместе с ним из сообщества уберутся ${owned.length} ${plural(owned.length, "чат", "чата", "чатов")}, которыми он владеет: ${owned.map((c) => `«${c.title}»`).join(", ")}.`
    : "";
  if (!(await askConfirm(`Удалить ${user.name} из сообщества «${community.title}»?${warning}`, { okLabel: "Удалить", danger: true }))) return;
  try {
    await api.banFromCommunity(community.id, user.id);
    showToast(`${user.name} удалён из сообщества`);
    refreshCommunities();
    onDone?.();
  } catch (err) {
    showToast(err?.message || "Не удалось удалить пользователя");
  }
}

// ---------- заявки ----------

export function openCommunityRequests(community, onChanged) {
  const list = el("div", { class: "tw-section" }, [empty("Загрузка…")]);
  const bulk = el("div", { class: "community-requests-bulk" });
  let requests = [];

  async function load() {
    try {
      ({ requests } = await api.communityRequests(community.id));
      paint();
    } catch (err) {
      list.replaceChildren(empty(err?.message || "Не удалось загрузить заявки"));
    }
  }

  async function resolve(requestId, approve, confirmText) {
    if (confirmText && !(await askConfirm(confirmText, { okLabel: approve ? "Добавить" : "Отклонить", danger: !approve }))) return;
    try {
      const res = await api.resolveCommunityRequest(community.id, requestId, approve);
      showToast(approve ? (res.added > 1 ? `Добавлено чатов: ${res.added}` : "Чат добавлен в сообщество") : res.declined > 1 ? `Отклонено заявок: ${res.declined}` : "Заявка отклонена");
      refreshCommunities();
      onChanged?.();
      load();
    } catch (err) {
      showToast(err?.message || "Не удалось обработать заявку");
    }
  }

  function paint() {
    bulk.replaceChildren(
      ...(requests.length > 1
        ? [
            el("button", { type: "button", class: "community-join-btn", onclick: () => resolve("all", true, `Добавить в сообщество все ${requests.length} чатов из заявок?`) }, "Добавить все"),
            el("button", { type: "button", class: "community-join-btn secondary", onclick: () => resolve("all", false, `Отклонить все ${requests.length} заявок?`) }, "Отклонить все"),
          ]
        : [])
    );
    list.replaceChildren(
      ...(requests.length
        ? requests.map((r) =>
            el("div", { class: "community-request" }, [
              chatRow(r.chat),
              el("p", { class: "community-request-by" }, `${r.suggestedBy?.name ?? "Кто-то"} предлагает ${kindWord(r.chat)}${r.visible ? "" : " (скрытый)"}`),
              el("div", { class: "community-request-actions" }, [
                el("button", { type: "button", class: "community-join-btn", onclick: () => resolve(r.id, true) }, "Добавить"),
                el("button", { type: "button", class: "community-join-btn secondary", onclick: () => resolve(r.id, false) }, "Отклонить"),
              ]),
            ])
          )
        : [empty("Новых заявок нет")])
    );
  }

  openSideTab({
    title: "Заявки на добавление",
    content: [el("p", { class: "tw-section-caption" }, "Пока в сообществе включён режим «Только администраторы», чаты участников добавляются после одобрения."), bulk, sectionGroup(null, list)],
  });
  load();
}
