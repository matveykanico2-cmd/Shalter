import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";
import { messagePreview } from "../lib/messagePreview.js";
import { isChatMuted } from "../lib/chatSort.js";

// Сообщества в списке чатов, как в tweb (components/communities): строка со
// «стопкой» вместо круглой аватарки, по нажатию — панель с чатами сообщества.

// Две полупрозрачные «карточки» за аватаркой — тот же path, что у tweb CommunityAvatarDecoration.
const DECORATION = `<svg class="community-avatar-decoration" viewBox="0 0 125 100" fill="none" aria-hidden="true"><path opacity="0.15" d="M26.4382 12.0185C26.0639 12.6406 25.7099 13.2766 25.3787 13.9267C23.6015 17.4147 22.788 21.3107 22.3913 26.165C21.9976 30.9845 21.9997 37.0086 21.9997 44.7997V55.2001C21.9997 62.9912 21.9976 69.0154 22.3913 73.8349C22.788 78.6891 23.6016 82.5852 25.3787 86.0732C26.6559 88.5799 28.2611 90.8845 30.1384 92.9345C28.104 91.6505 26.3049 90.0031 24.8396 88.0585C21.9499 84.2238 20.977 78.7084 19.032 67.6777L15.2117 46.0117C13.2667 34.9811 12.2943 29.4656 13.698 24.874C14.9328 20.8349 17.4147 17.2898 20.7878 14.748C22.3208 13.5928 24.123 12.7455 26.4382 12.0185Z" fill="currentColor"/><path opacity="0.1" d="M10.3996 25.7243C9.94967 28.0394 9.95115 30.4979 10.2131 33.3063C10.5379 36.7882 11.2941 41.0664 12.258 46.5329L16.0783 68.1989C17.0421 73.665 17.7943 77.9439 18.6799 81.3268C19.5744 84.7434 20.6657 87.5055 22.4436 89.8649C23.0895 90.722 23.7919 91.5293 24.5441 92.2819C23.6762 91.7404 22.8569 91.1149 22.1008 90.4098C19.2915 87.7901 17.7593 83.5791 14.6945 75.1588L6.89668 53.734C3.83196 45.3138 2.29974 41.1032 2.76778 37.2907C3.17959 33.9371 4.6422 30.7998 6.94649 28.3288C7.86463 27.3442 8.97798 26.5161 10.3996 25.7243Z" fill="currentColor"/></svg>`;

export function CommunityAvatar(community, size = 54) {
  return el("span", { class: "community-avatar", style: `--community-avatar-size: ${size}px` }, [
    el("span", { html: DECORATION, class: "community-avatar-decoration-wrap" }),
    Avatar({ name: community.title, color: community.avatarColor, size }),
  ]);
}

export async function openCommunityPanel(id) {
  details.delete(id);
  if (!(getState().communities ?? []).some((c) => c.id === id)) {
    try {
      const { communities } = await api.joinedCommunities();
      setState({ communities });
    } catch {}
  } else {
    api.joinedCommunities().then(({ communities }) => setState({ communities })).catch(() => {});
  }
  setState({ sidebarCommunity: id, sidebarArchive: false });
  const p = window.location.pathname;
  if (window.innerWidth < 768 && p !== "/" && !p.startsWith("/chat/")) navigate("/");
  else if (window.innerWidth < 768 && p.startsWith("/chat/")) navigate("/");
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

// Строка в списке чатов: последнее сообщение — из самого свежего чата, «Чат: текст».
export function CommunityRow(community, chats) {
  const mine = memberChatsOf(community, chats);
  const latest = [...mine].sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""))[0];
  const unread = mine.filter((c) => !isChatMuted(c)).reduce((n, c) => n + (c.unreadCount || 0), 0);
  const mutedUnread = mine.filter(isChatMuted).reduce((n, c) => n + (c.unreadCount || 0), 0);
  const total = unread + mutedUnread;
  const preview = latest?.lastMessage
    ? [el("span", { class: "community-row-chat" }, `${latest.title}: `), messagePreview(latest.lastMessage)]
    : [`${community.chatIds.length} ${plural(community.chatIds.length, "чат", "чата", "чатов")}`];
  return el("div", { class: "chat-list-item-wrap", "data-community-id": community.id }, [
    el(
      "button",
      {
        class: `chat-list-item community-row ${getState().sidebarCommunity === community.id ? "active" : ""}`,
        onclick: () => openCommunityPanel(community.id),
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
              total ? el("span", { class: `unread-badge ${unread ? "" : "muted"}` }, total > 99 ? "99+" : String(total)) : null,
            ]),
          ]),
        ]),
      ]
    ),
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

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Подробности (чаты, где я не состою, права владельца) грузим при открытии панели.
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
      .catch(() => {})
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
