import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { navigate } from "../router.js";

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

const ATTACHMENT_LABEL = {
  image: "📷 Фото",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: null,
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

function preview(chat, meId) {
  if (chat.draft) return chat.draft;
  const m = chat.lastMessage;
  if (!m) return "Нет сообщений";
  if (m.type === "system") return m.text;
  const who = m.senderId === meId ? "Вы: " : "";
  const att = m.attachments?.[0];
  if (att) {
    const label = att.kind === "poll" ? `📊 ${m.text}` : ATTACHMENT_LABEL[att.kind] ?? m.text;
    return `${who}${label}`;
  }
  return `${who}${m.text}`;
}

export function ChatListItem({ chat, active, meId, onPatch }) {
  const title = chat.type === "dm" || chat.type === "secret" ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const online = (chat.type === "dm" || chat.type === "secret") && chat.otherUser?.online;

  const wrap = el("div", { class: "chat-list-item-wrap" });

  const btn = el(
    "button",
    {
      class: `chat-list-item ${active ? "active" : ""}`,
      onclick: () => navigate(`/chat/${chat.id}`),
      oncontextmenu: (e) => {
        e.preventDefault();
        openMenu({ x: e.clientX, y: e.clientY });
      },
    },
    [
      Avatar({ name: chat.otherUser?.name ?? title, color: chat.avatarColor, image: chat.otherUser?.avatarImage, online }),
      el("div", { class: "chat-list-item-body" }, [
        el("div", { class: "chat-list-item-row" }, [
          chat.type === "secret" ? el("span", { html: iconSvg("Lock", 13, "text-accent") }) : null,
          el("span", { class: "chat-list-item-title" }, title),
          el(
            "span",
            { class: "chat-list-item-time" },
            chat.lastMessage ? timeLabel(chat.lastMessage.createdAt) : ""
          ),
        ]),
        el("div", { class: "chat-list-item-row" }, [
          el("span", { class: `chat-list-item-preview ${chat.draft ? "draft" : ""}` }, preview(chat, meId)),
          el("span", { class: "chat-list-item-badges" }, [
            chat.pinned ? el("span", { html: iconSvg("Pin", 12) }) : null,
            chat.muted ? el("span", { html: iconSvg("BellOff", 12) }) : null,
            chat.unreadCount > 0
              ? el("span", { class: "unread-badge" }, chat.unreadCount > 99 ? "99+" : String(chat.unreadCount))
              : null,
          ]),
        ]),
      ]),
    ]
  );
  wrap.appendChild(btn);

  function openMenu(pos) {
    openDropdownMenu(pos, [
      {
        icon: "Pin",
        label: chat.pinned ? "Открепить" : "Закрепить",
        onClick: () => onPatch(chat.id, { pinned: !chat.pinned }),
      },
      {
        icon: chat.muted ? "Bell" : "BellOff",
        label: chat.muted ? "Включить уведомления" : "Отключить уведомления",
        onClick: () => onPatch(chat.id, { muted: !chat.muted }),
      },
      {
        icon: "Archive",
        label: chat.archived ? "Вернуть из архива" : "Архивировать",
        onClick: () => onPatch(chat.id, { archived: !chat.archived }),
      },
    ]);
  }

  return wrap;
}
