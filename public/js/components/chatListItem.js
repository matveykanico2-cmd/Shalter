import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openChoiceDialog } from "./confirmDialog.js";
import { navigate } from "../router.js";
import { safetyLabelInfo } from "../lib/safetyLabels.js";
import { isChatAdmin } from "../lib/chatRoles.js";
import { messagePreview } from "../lib/messagePreview.js";
import { VerifiedBadge } from "./verifiedBadge.js";

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function preview(chat, meId) {
  if (chat.draft) return `Черновик: ${chat.draft}`;
  const m = chat.lastMessage;
  if (!m) return "Нет сообщений";
  if (m.type === "system") return m.text;
  // Stickers, gifts and attachments carry no text of their own — messagePreview
  // names them, so the row doesn't go blank ("Вы: ") after sending one.
  const who = m.senderId === meId ? "Вы: " : "";
  return `${who}${messagePreview(m)}`;
}

export function ChatListItem({ chat, active, meId, onPatch, onDelete, onLeave }) {
  const title = chat.type === "dm" ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const online = chat.type === "dm" && chat.otherUser?.online;

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
      Avatar({
        name: chat.otherUser?.name ?? title,
        color: chat.otherUser?.avatarColor ?? chat.avatarColor,
        image: chat.otherUser?.avatarImage ?? chat.avatarImage,
        online,
      }),
      el("div", { class: "chat-list-item-body" }, [
        el("div", { class: "chat-list-item-row" }, [
          el("span", { class: "chat-list-item-title" }, title),
          VerifiedBadge(chat.type === "dm" ? chat.otherUser : chat, 13),
          chat.otherUser?.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 13) }) : null,
          chat.otherUser?.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 13) }) : null,
          // Safety marker (server/db.js's safetyLabel) right on the row — the
          // warning has to be visible before the chat is even opened.
          safetyLabelInfo(chat.otherUser?.safetyLabel)
            ? el(
                "span",
                {
                  class: `safety-badge safety-mini safety-${chat.otherUser.safetyLabel}`,
                  title: safetyLabelInfo(chat.otherUser.safetyLabel).hint,
                },
                safetyLabelInfo(chat.otherUser.safetyLabel).short
              )
            : null,
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
            chat.hasUnreadMention ? el("span", { class: "mention-badge" }, "@") : null,
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
      { separator: true },
      {
        icon: "Trash",
        label: "Удалить чат",
        danger: true,
        onClick: () => {
          const isDmLike = chat.type === "dm" || chat.type === "bot";
          const what = chat.type === "channel" ? "канал" : "группу";
          // A group or channel used to offer only "удалить у меня", which hides
          // it — and the first new message brought it straight back, so its own
          // owner had no way to delete it at all. Now the people who run it can
          // really delete it, and everyone else gets the honest option: leave.
          openChoiceDialog(
            "Удалить чат",
            isDmLike
              ? [
                  { label: "Удалить у меня", onClick: () => onDelete(chat.id, false) },
                  { label: "Удалить у всех", danger: true, onClick: () => onDelete(chat.id, true) },
                ]
              : isChatAdmin(chat, meId)
                ? [
                    { label: "Скрыть у себя", onClick: () => onDelete(chat.id, false) },
                    { label: `Удалить ${what} для всех`, danger: true, onClick: () => onDelete(chat.id, true) },
                  ]
                : [
                    { label: "Скрыть у себя", onClick: () => onDelete(chat.id, false) },
                    { label: `Выйти из ${what === "канал" ? "канала" : "группы"}`, danger: true, onClick: () => onLeave?.(chat.id) },
                  ]
          );
        },
      },
    ]);
  }

  return wrap;
}
