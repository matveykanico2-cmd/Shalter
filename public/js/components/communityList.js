import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";
import { messagePreview } from "../lib/messagePreview.js";
import { isChatMuted } from "../lib/chatSort.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openMuteDurationDialog } from "../lib/muteDurations.js";
import { showToast } from "./toast.js";
import {
  openEditCommunityDialog,
  openCommunityChatSettings,
  openCommunityRequests,
  openAddChatFlow,
  removeChatFromCommunity,
  leaveCommunity,
  deleteCommunity,
  refreshCommunities,
} from "./communityEditor.js";

// Экраны редактирования живут в communityEditor.js — здесь строка сообщества в
// списке чатов (tweb createCommunityDialogElement), его контекстное меню и панель
// с чатами сообщества (tweb forumTab/communityChats).
export { openEditCommunityDialog, openCreateCommunityDialog, openOwnChatPicker, openCommunityChatSettings } from "./communityEditor.js";

// Две полупрозрачные «карточки» за аватаркой — тот же path, что у tweb CommunityAvatarDecoration.
const DECORATION = `<svg class="community-avatar-decoration" viewBox="0 0 125 100" fill="none" aria-hidden="true"><path opacity="0.15" d="M26.4382 12.0185C26.0639 12.6406 25.7099 13.2766 25.3787 13.9267C23.6015 17.4147 22.788 21.3107 22.3913 26.165C21.9976 30.9845 21.9997 37.0086 21.9997 44.7997V55.2001C21.9997 62.9912 21.9976 69.0154 22.3913 73.8349C22.788 78.6891 23.6016 82.5852 25.3787 86.0732C26.6559 88.5799 28.2611 90.8845 30.1384 92.9345C28.104 91.6505 26.3049 90.0031 24.8396 88.0585C21.9499 84.2238 20.977 78.7084 19.032 67.6777L15.2117 46.0117C13.2667 34.9811 12.2943 29.4656 13.698 24.874C14.9328 20.8349 17.4147 17.2898 20.7878 14.748C22.3208 13.5928 24.123 12.7455 26.4382 12.0185Z" fill="currentColor"/><path opacity="0.1" d="M10.3996 25.7243C9.94967 28.0394 9.95115 30.4979 10.2131 33.3063C10.5379 36.7882 11.2941 41.0664 12.258 46.5329L16.0783 68.1989C17.0421 73.665 17.7943 77.9439 18.6799 81.3268C19.5744 84.7434 20.6657 87.5055 22.4436 89.8649C23.0895 90.722 23.7919 91.5293 24.5441 92.2819C23.6762 91.7404 22.8569 91.1149 22.1008 90.4098C19.2915 87.7901 17.7593 83.5791 14.6945 75.1588L6.89668 53.734C3.83196 45.3138 2.29974 41.1032 2.76778 37.2907C3.17959 33.9371 4.6422 30.7998 6.94649 28.3288C7.86463 27.3442 8.97798 26.5161 10.3996 25.7243Z" fill="currentColor"/></svg>`;

export function CommunityAvatar(community, size = 54) {
  return el("span", { class: "community-avatar", style: `--community-avatar-size: ${size}px` }, [
    el("span", { html: DECORATION, class: "community-avatar-decoration-wrap" }),
    Avatar({ name: community.title, color: community.avatarColor, image: community.avatarImage, size }),
  ]);
}

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export async function openCommunityPanel(id) {
  details.delete(id);
  if (!(getState().communities ?? []).some((c) => c.id === id)) await refreshCommunities();
  else refreshCommunities();
  if (!(getState().communities ?? []).some((c) => c.id === id)) {
    // Не участник — открываем страницу сообщества, с неё можно вступить.
    navigate(`/community/${id}`);
    return;
  }
  setState({ sidebarCommunity: id, sidebarArchive: false });
  const p = window.location.pathname;
  if (window.innerWidth < 768 && p !== "/") navigate("/");
}

export function communityOfChatId(chatId) {
  return (getState().communities ?? []).find((c) => c.chatIds.includes(chatId)) ?? null;
}

function timeLabel(iso) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// Чаты сообщества, в которых я состою, — из общего списка.
export function memberChatsOf(community, chats) {
  return chats.filter((c) => community.chatIds.includes(c.id));
}

export function communityActivity(community, chats) {
  return memberChatsOf(community, chats).reduce((max, c) => {
    const t = c.lastMessage?.createdAt ?? c.createdAt ?? "";
    return t > max ? t : max;
  }, "");
}

// Сообщество «без звука», когда заглушены все мои его чаты.
export function isCommunityMuted(community, chats) {
  const mine = memberChatsOf(community, chats);
  return mine.length > 0 && mine.every(isChatMuted);
}

const hasUnread = (c) => c.unreadCount > 0 || !!c.hasUnreadMention || !!c.unread;

// ---------- действия ----------

async function run(fn, fallback) {
  try {
    await fn();
    await refreshCommunities();
    const { chats } = await api.listChats();
    setState({ chats });
  } catch (err) {
    showToast(err?.message || fallback);
  }
}

export function communityMenuItems(community, { inPanel = false } = {}) {
  const chats = getState().chats ?? [];
  const muted = isCommunityMuted(community, chats);
  const unread = memberChatsOf(community, chats).some(hasUnread);
  const rights = community.rights ?? {};
  const link = `${location.origin}/community/${community.id}`;
  return [
    !inPanel && { icon: "Layers", label: "Открыть сообщество", onClick: () => openCommunityPanel(community.id) },
    {
      icon: "Pin",
      label: community.pinned ? "Открепить" : "Закрепить",
      onClick: () => run(() => api.setCommunityPrefs(community.id, { pinned: !community.pinned }), "Не удалось закрепить"),
    },
    {
      icon: muted ? "Bell" : "BellOff",
      label: muted ? "Включить уведомления" : "Отключить уведомления",
      onClick: muted
        ? () => run(() => api.muteCommunity(community.id, { off: true }), "Не удалось включить уведомления")
        : () => openMuteDurationDialog((opts) => run(() => api.muteCommunity(community.id, opts), "Не удалось отключить уведомления")),
    },
    unread && { icon: "Check", label: "Отметить как прочитанное", onClick: () => run(() => api.readCommunity(community.id), "Не удалось отметить прочитанным") },
    {
      icon: "Layers",
      label: community.collapsed ? "Показывать чаты отдельно" : "Показывать одной строкой",
      onClick: () => run(() => api.setCommunityPrefs(community.id, { collapsed: !community.collapsed }), "Не удалось изменить вид"),
    },
    { icon: "Link", label: "Скопировать ссылку", onClick: () => navigator.clipboard?.writeText(link).then(() => showToast("Ссылка скопирована"), () => {}) },
    { separator: true },
    {
      icon: rights.editInfo || rights.editChats ? "Edit" : "Users",
      label: rights.editInfo || rights.editChats ? "Изменить сообщество" : "О сообществе",
      onClick: () => openEditCommunityDialog(community.id, () => forgetCommunityDetails(community.id)),
    },
    community.requestsCount ? { icon: "Inbox", label: `Заявки (${community.requestsCount})`, onClick: () => openCommunityRequests(community, () => forgetCommunityDetails(community.id)) } : null,
    community.isOwner
      ? { icon: "Trash", label: "Удалить сообщество", danger: true, onClick: () => deleteCommunity(community) }
      : { icon: "LogOut", label: "Покинуть сообщество", danger: true, onClick: () => leaveCommunity(community) },
  ].filter(Boolean);
}

// ---------- строка в списке чатов ----------

// Последнее сообщение — из самого свежего чата, «Чат: текст».
export function CommunityRow(community, chats) {
  const mine = memberChatsOf(community, chats);
  const latest = [...mine].sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""))[0];
  const unread = mine.filter((c) => !isChatMuted(c)).reduce((n, c) => n + (c.unreadCount || 0), 0);
  const mutedUnread = mine.filter(isChatMuted).reduce((n, c) => n + (c.unreadCount || 0), 0);
  const total = unread + mutedUnread;
  const mention = mine.some((c) => c.hasUnreadMention);
  const muted = isCommunityMuted(community, chats);
  const preview = latest?.lastMessage
    ? [el("span", { class: "community-row-chat" }, `${latest.title}: `), messagePreview(latest.lastMessage)]
    : [`${community.chatIds.length} ${plural(community.chatIds.length, "чат", "чата", "чатов")}`];
  const openMenu = (pos) => openDropdownMenu(pos, communityMenuItems(community));
  return el("div", { class: "chat-list-item-wrap with-more", "data-community-id": community.id }, [
    el(
      "button",
      {
        class: `chat-list-item community-row ${getState().sidebarCommunity === community.id ? "active" : ""}`,
        onclick: () => openCommunityPanel(community.id),
        oncontextmenu: (e) => {
          e.preventDefault();
          openMenu({ x: e.clientX, y: e.clientY });
        },
      },
      [
        CommunityAvatar(community, 54),
        el("div", { class: "chat-list-item-body" }, [
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-title" }, community.title),
            el("span", { class: "chat-list-item-time" }, latest?.lastMessage ? timeLabel(latest.lastMessage.createdAt) : ""),
          ]),
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-preview" }, preview),
            el("span", { class: "chat-list-item-badges" }, [
              community.pinned ? el("span", { html: iconSvg("Pin", 12) }) : null,
              muted ? el("span", { html: iconSvg("BellOff", 12) }) : null,
              community.requestsCount ? el("span", { class: "community-requests-dot", title: `Заявок: ${community.requestsCount}` }) : null,
              mention ? el("span", { class: "mention-badge" }, "@") : null,
              total ? el("span", { class: `unread-badge ${unread ? "" : "muted"}` }, total > 99 ? "99+" : String(total)) : null,
            ]),
          ]),
        ]),
      ]
    ),
    el("button", {
      class: "chat-list-item-more",
      type: "button",
      title: "Действия с сообществом",
      "aria-label": "Действия с сообществом",
      html: iconSvg("MoreVertical", 18),
      onpointerdown: (e) => e.stopPropagation(),
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        openMenu({ x: r.right - 8, y: r.bottom + 2 });
      },
    }),
  ]);
}

// Значок на аватарке чата, входящего в сообщество (tweb CommunityChildBadge).
export function CommunityChildBadge(community) {
  return el("span", {
    class: "community-child-badge",
    role: "button",
    title: `Сообщество «${community.title}»`,
    html: iconSvg("ChevronDown", 11),
    onpointerdown: (e) => e.stopPropagation(),
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCommunityPanel(community.id);
    },
  });
}

// ---------- панель сообщества ----------

// Подробности (чаты, где я не состою, права) грузим при открытии панели.
const details = new Map();
const loading = new Set();
export function communityDetails(id, onLoaded) {
  if (!details.has(id) && !loading.has(id)) {
    loading.add(id);
    api
      .getCommunity(id)
      .then(({ community }) => {
        details.set(id, community);
        onLoaded?.();
      })
      .catch(() => {
        details.set(id, { failed: true });
        onLoaded?.();
      })
      .finally(() => loading.delete(id));
  }
  return details.get(id) ?? null;
}
export function forgetCommunityDetails(id) {
  details.delete(id);
}
export function setCommunityDetails(id, community) {
  details.set(id, community);
}

const membersLabel = (c) =>
  `${c.members} ${c.type === "channel" ? plural(c.members, "подписчик", "подписчика", "подписчиков") : plural(c.members, "участник", "участника", "участников")}`;

// Строка чата, где я не состою: вступить / подать заявку / по приглашению.
function OtherChatRow(community, c, rerender) {
  let action;
  if (c.isPublic) {
    action = el("button", {
      class: "community-join-btn",
      onclick: async (e) => {
        e.stopPropagation();
        e.currentTarget.disabled = true;
        try {
          const res = await api.joinPublicChat(c.id);
          if (res.pending) showToast(c.type === "channel" ? "Заявка на вступление в канал отправлена его администраторам" : "Заявка на вступление в группу отправлена её администраторам");
          const { chats } = await api.listChats();
          setState({ chats });
          forgetCommunityDetails(community.id);
          await refreshCommunities();
          if (!res.pending) navigate(`/chat/${c.id}`);
        } catch (err) {
          showToast(err?.message || "Не удалось вступить");
        }
        rerender();
      },
    }, c.approveJoins ? "Подать заявку" : c.type === "channel" ? "Подписаться" : "Вступить");
  } else {
    action = el("span", { class: "community-invite-only", title: "Вступить можно только по приглашению" }, [el("span", { html: iconSvg("Lock", 13) }), " по приглашению"]);
  }
  const rights = community.rights ?? {};
  return el("div", { class: "chat-list-item-wrap" }, [
    el(
      "div",
      {
        class: "chat-list-item community-other-chat",
        oncontextmenu: rights.editChats
          ? (e) => {
              e.preventDefault();
              openDropdownMenu({ x: e.clientX, y: e.clientY }, panelChatMenu(community, c, rerender));
            }
          : null,
      },
      [
        Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 54 }),
        el("div", { class: "chat-list-item-body" }, [
          el("div", { class: "chat-list-item-row" }, [
            el("span", { class: "chat-list-item-title" }, [c.title, c.visible === false ? el("span", { class: "community-hidden-icon", title: "Скрытый чат", html: iconSvg("EyeOff", 13) }) : null]),
          ]),
          el("div", { class: "chat-list-item-row" }, [el("span", { class: "chat-list-item-preview" }, `${c.username ? `@${c.username} · ` : ""}${membersLabel(c)}`)]),
        ]),
        action,
      ]
    ),
  ]);
}

// Пункты управления чатом внутри сообщества (tweb: Community.RemoveChat в контекстном меню).
function panelChatMenu(community, card, rerender) {
  const rights = community.rights ?? {};
  const after = () => (forgetCommunityDetails(community.id), rerender());
  return [
    rights.editChats && {
      icon: card.visible === false ? "Eye" : "EyeOff",
      label: "Видимость в сообществе",
      onClick: () => openCommunityChatSettings(community, card, after),
    },
    (rights.editChats || card.isChatAdmin) && {
      icon: "X",
      label: card.type === "channel" ? "Убрать канал из сообщества" : "Убрать группу из сообщества",
      danger: true,
      onClick: async () => (await removeChatFromCommunity(community, card)) && after(),
    },
  ].filter(Boolean);
}

// Рисует панель в bodySlot/scrollSlot списка чатов. renderChat(chat, extraMenu) —
// обычная строка чата из chatList.js (со всеми её действиями).
export function renderCommunityPanel({ bodySlot, scrollSlot, community: base, rerender, renderChat }) {
  const info = communityDetails(base.id, rerender);
  const community = info && !info.failed ? { ...base, ...info } : base;
  const chats = getState().chats ?? [];
  const cards = new Map((info?.chats ?? []).map((c) => [c.id, c]));
  const mine = memberChatsOf(base, chats).sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
  const others = (info?.chats ?? []).filter((c) => !c.isMember);
  const open = others.filter((c) => c.isPublic && !c.approveJoins && c.visible !== false);
  const requestable = others.filter((c) => c.isPublic && c.approveJoins && c.visible !== false);
  const hidden = others.filter((c) => c.visible === false);
  const inviteOnly = others.filter((c) => !c.isPublic && c.visible !== false);
  const count = info?.chats?.length ?? base.chatIds.length;
  const close = () => setState({ sidebarCommunity: null });

  bodySlot.appendChild(
    el("div", { class: "community-panel-head" }, [
      el("button", { class: "icon-btn community-panel-back", title: "Назад к чатам", html: iconSvg("ChevronLeft", 22), onclick: close }),
      el("button", { class: "community-panel-info", title: "О сообществе", onclick: () => openEditCommunityDialog(base.id, () => (forgetCommunityDetails(base.id), rerender())) }, [
        CommunityAvatar(community, 40),
        el("span", { class: "community-panel-titles" }, [
          el("span", { class: "community-panel-title" }, community.title),
          el("span", { class: "community-panel-subtitle" }, [
            `${count} ${plural(count, "чат", "чата", "чатов")}`,
            info?.membersCount ? ` · ${info.membersCount} ${plural(info.membersCount, "участник", "участника", "участников")}` : "",
          ]),
        ]),
      ]),
      el("button", {
        class: "icon-btn",
        title: "Ещё",
        html: iconSvg("MoreVertical", 20),
        onclick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openDropdownMenu({ x: r.right - 8, y: r.bottom + 2 }, communityMenuItems(community, { inPanel: true }));
        },
      }),
    ])
  );

  const box = scrollSlot;
  if (info?.failed) {
    box.appendChild(
      el("div", { class: "community-panel-error" }, [
        el("p", { class: "empty-hint" }, "Не удалось загрузить сообщество"),
        el("button", { class: "community-join-btn", onclick: () => (forgetCommunityDetails(base.id), rerender()) }, "Повторить"),
      ])
    );
  }
  if (community.description) box.appendChild(el("p", { class: "community-panel-description" }, community.description));
  if (community.requestsCount) {
    box.appendChild(
      el("button", { class: "community-requests-banner", onclick: () => openCommunityRequests(community, () => (forgetCommunityDetails(base.id), refreshCommunities(), rerender())) }, [
        el("span", { html: iconSvg("Inbox", 18) }),
        el("span", {}, `${community.requestsCount} ${plural(community.requestsCount, "заявка", "заявки", "заявок")} на добавление чата`),
        el("span", { html: iconSvg("ChevronRight", 16) }),
      ])
    );
  }
  if (info && community.addPolicy) {
    box.appendChild(
      el("button", { class: "community-add-chat", onclick: () => openAddChatFlow(community, () => (forgetCommunityDetails(base.id), rerender())) }, [
        el("span", { class: "community-add-chat-icon", html: iconSvg("Plus", 22) }),
        el("span", {}, community.addPolicy === "suggest" ? "Предложить свой чат" : "Добавить чат в сообщество"),
      ])
    );
  }

  const section = (label, nodes) => {
    if (!nodes.length) return;
    box.appendChild(el("p", { class: "list-section-label" }, label));
    for (const n of nodes) box.appendChild(n);
  };
  section(
    "Ваши чаты",
    mine.map((c) => renderChat(c, panelChatMenu(community, cards.get(c.id) ?? { ...c, visible: true, isChatAdmin: false }, rerender)))
  );
  section("Можно вступить", open.map((c) => OtherChatRow(community, c, rerender)));
  section("Вступление по заявке", requestable.map((c) => OtherChatRow(community, c, rerender)));
  section("По приглашению", inviteOnly.map((c) => OtherChatRow(community, c, rerender)));
  section("Скрытые чаты", hidden.map((c) => OtherChatRow(community, c, rerender)));

  if (!mine.length && !others.length) {
    box.appendChild(
      el("p", { class: "empty-hint" }, !info ? "Загрузка…" : community.addPolicy ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов")
    );
  }
  bodySlot.appendChild(box);
}
