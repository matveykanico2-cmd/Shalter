import { el } from "../lib/dom.js";
import { PremiumStar } from "./premiumStar.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openDeleteChatDialog } from "./deleteChatDialog.js";
import { navigate } from "../router.js";
import { api } from "../api.js";
import { prefetchChat } from "../lib/chatPrefetch.js";
import { safetyLabelInfo } from "../lib/safetyLabels.js";
import { messagePreview } from "../lib/messagePreview.js";
import { VerifiedBadge } from "./verifiedBadge.js";
import { ProfileStatusBadge } from "./profileStatusBadge.js";
import { getState, setState } from "../state.js";
import { isChatMuted } from "../lib/chatSort.js";
import { openMuteDurationDialog } from "../lib/muteDurations.js";

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

const ceStrip = (t) => (t ?? "").replace(/\[ce:\d+\]/g, "🎨");

function preview(chat, meId) {
  if (chat.draft) return ceStrip(chat.draft);
  const m = chat.lastMessage;
  if (!m) return "Нет сообщений";
  if (m.type === "system") return ceStrip(m.text);
  const who = m.senderId === meId && !chat.isSaved ? "Вы: " : "";
  return `${who}${messagePreview(m)}`;
}

export function ChatListItem({ chat, active, meId, onPatch, onMute, onDelete, onLeave, onOpen, onRead }) {
  const title = chat.type === "dm" ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const online = chat.type === "dm" && chat.otherUser?.online;
  const muted = isChatMuted(chat);

  const wrap = el("div", { class: "chat-list-item-wrap with-more", "data-chat-id": chat.id });
  const swipeHint = el("div", { class: "chat-swipe-actions" }, [
    el("span", { class: "chat-swipe-action mute" }, muted ? "Со звуком" : "Без звука"),
    el("span", { class: "chat-swipe-action archive" }, chat.archived ? "Из архива" : "В архив"),
  ]);

  const SWIPE_ACTION_PX = 72;
  let startX = 0;
  let startY = 0;
  let sliding = null;
  function resetSlide() {
    btn.style.transform = "";
    wrap.classList.remove("swiping");
    sliding = null;
    startX = 0;
  }

  const btn = el(
    "button",
    {
      class: `chat-list-item ${active ? "active" : ""}`,
      onclick: () => (onOpen ? onOpen(chat.id) : navigate(`/chat/${chat.id}`)),
      oncontextmenu: (e) => {
        e.preventDefault();
        openMenu({ x: e.clientX, y: e.clientY });
      },
      onpointerenter: (e) => {
        if (e.pointerType === "mouse") prefetchChat(chat);
      },
      onpointerdown: (e) => {
        if (e.pointerType === "mouse") return prefetchChat(chat);
        prefetchChat(chat);
        startX = e.clientX;
        startY = e.clientY;
        sliding = null;
      },
      onpointermove: (e) => {
        if (!startX || sliding === false) return;
        const dx = e.clientX - startX;
        const dy = Math.abs(e.clientY - startY);
        if (sliding === null) {
          if (Math.abs(dx) < 12 && dy < 12) return;
          sliding = Math.abs(dx) > dy && dx < 0;
          if (!sliding) return;
          wrap.classList.add("swiping");
        }
        btn.style.transform = `translateX(${Math.max(-140, dx)}px)`;
      },
      onpointerup: (e) => {
        if (sliding !== true) return resetSlide();
        const dx = e.clientX - startX;
        resetSlide();
        if (dx <= -SWIPE_ACTION_PX * 2) onPatch?.(chat.id, { archived: !chat.archived });
        else if (dx <= -SWIPE_ACTION_PX) onPatch?.(chat.id, { muted: !muted });
      },
      onpointercancel: resetSlide,
    },
    [
      chat.isSaved
        ? el("span", { class: "saved-avatar", html: iconSvg("Bookmark", 24) })
        : Avatar({
            size: 52,
            name: chat.otherUser?.name ?? title,
            color: chat.otherUser?.avatarColor ?? chat.avatarColor,
            image: chat.otherUser?.avatarImage ?? chat.avatarImage,
            online,
          }),
      el("div", { class: "chat-list-item-body" }, [
        el("div", { class: "chat-list-item-row" }, [
          chat.secret ? el("span", { class: "secret-chat-lock", title: "Секретный чат", html: iconSvg("Lock", 13) }) : null,
          el("span", { class: `chat-list-item-title${chat.secret ? " secret-chat-title" : ""}` }, title),
          VerifiedBadge(chat.type === "dm" ? chat.otherUser : chat, 13),
          chat.otherUser?.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 13) }) : null,
          chat.otherUser?.isPremium ? PremiumStar({ size: 15, seed: chat.otherUser.id, title: "Shalter Premium" }) : null,
          ProfileStatusBadge(chat.type === "dm" ? chat.otherUser : chat, 15),
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
          el("span", { class: "chat-list-item-preview" }, [
            chat.draft ? el("span", { class: "chat-preview-draft" }, "Черновик: ") : null,
            preview(chat, meId),
          ]),
          el("span", { class: "chat-list-item-badges" }, [
            chat.pinned ? el("span", { html: iconSvg("Pin", 12) }) : null,
            muted ? el("span", { html: iconSvg("BellOff", 12) }) : null,
            chat.hasUnreadMention ? el("span", { class: "mention-badge" }, "@") : null,
            chat.unreadCount > 0
              ? el("span", { class: "unread-badge" }, chat.unreadCount > 99 ? "99+" : String(chat.unreadCount))
              : chat.unread
                ? el("span", { class: "unread-badge unread-badge-mark", "aria-label": "Отмечен как непрочитанный" })
                : null,
          ]),
        ]),
      ]),
    ]
  );
  const moreBtn = el("button", {
    class: "chat-list-item-more",
    type: "button",
    title: "Действия с чатом",
    "aria-label": "Действия с чатом",
    html: iconSvg("MoreVertical", 18),
    onpointerdown: (e) => e.stopPropagation(),
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      openMenu({ x: r.right - 8, y: r.bottom + 2 });
    },
  });
  wrap.append(swipeHint, btn, moreBtn);

  function openMenu(pos) {
    openDropdownMenu(pos, [
      {
        icon: "Pin",
        label: chat.pinned ? "Открепить" : "Закрепить",
        onClick: () => onPatch(chat.id, { pinned: !chat.pinned }),
      },
      {
        icon: muted ? "Bell" : "BellOff",
        label: muted ? "Включить уведомления" : "Отключить уведомления",
        onClick: muted
          ? () => onPatch(chat.id, { muted: false })
          : () => openMuteDurationDialog((opts) => onMute(chat.id, opts)),
      },
      {
        icon: "Folder",
        label: "Добавить в папку",
        onClick: () => setTimeout(() => openFolderMenu(pos), 0),
      },
      {
        icon: "Archive",
        label: chat.archived ? "Вернуть из архива" : "Архивировать",
        onClick: () => onPatch(chat.id, { archived: !chat.archived }),
      },
      chat.unreadCount > 0 || chat.hasUnreadMention || chat.unread
        ? {
            icon: "Check",
            label: "Отметить как прочитанное",
            onClick: async () => {
              onRead?.(chat.id);
              try {
                await api.markChatRead(chat.id);
              } catch (err) {
                alert(err.message || "Не удалось отметить чат прочитанным");
              }
            },
          }
        : {
            icon: "MessageSquare",
            label: "Отметить как непрочитанное",
            onClick: () => onPatch(chat.id, { unread: true }),
          },
      { separator: true },
      {
        icon: "Trash",
        label: "Удалить чат",
        danger: true,
        onClick: () =>
          openDeleteChatDialog(chat, meId, {
            onDelete: (forEveryone) => onDelete(chat.id, forEveryone),
            onLeave: chat.type === "group" || chat.type === "channel" ? () => onLeave?.(chat.id) : null,
          }),
      },
    ].filter(Boolean));
  }

  function openFolderMenu(pos) {
    const folders = getState().folders ?? [];
    const items = folders.map((f) => {
      const inside = f.chatIds.includes(chat.id);
      return {
        icon: inside ? "Check" : "Folder",
        label: f.name,
        onClick: async () => {
          const chatIds = inside ? f.chatIds.filter((id) => id !== chat.id) : [...f.chatIds, chat.id];
          const before = getState().folders;
          setState({ folders: before.map((x) => (x.id === f.id ? { ...x, chatIds } : x)) });
          try {
            await api.patchFolder(f.id, { chatIds });
          } catch (err) {
            setState({ folders: before });
            alert(err.message || "Не удалось изменить папку");
          }
        },
      };
    });
    if (items.length) items.push({ separator: true });
    items.push({
      icon: "Plus",
      label: "Новая папка",
      onClick: async () => {
        const name = prompt("Название папки")?.trim();
        if (!name) return;
        try {
          const { folder } = await api.createFolder(name, [chat.id]);
          setState({ folders: [...(getState().folders ?? []), folder] });
        } catch (err) {
          alert(err.message || "Не удалось создать папку");
        }
      },
    });
    openDropdownMenu(pos, items);
  }

  return wrap;
}
