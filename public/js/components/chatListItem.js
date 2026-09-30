import { el } from "../lib/dom.js";
import { PremiumStar } from "./premiumStar.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openDeleteChatDialog } from "./deleteChatDialog.js";
import { navigate } from "../router.js";
import { api } from "../api.js";
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

// Токен кастомного эмодзи ([ce:N]) в плоской строке рисовать нечем — 🎨.
const ceStrip = (t) => (t ?? "").replace(/\[ce:\d+\]/g, "🎨");

function preview(chat, meId) {
  if (chat.draft) return ceStrip(chat.draft);
  const m = chat.lastMessage;
  if (!m) return "Нет сообщений";
  if (m.type === "system") return ceStrip(m.text);
  // Stickers, gifts and attachments carry no text of their own — messagePreview
  // names them, so the row doesn't go blank ("Вы: ") after sending one.
  // В «Избранном» всё написано тобой — «Вы:» перед каждым превью там лишнее.
  const who = m.senderId === meId && !chat.isSaved ? "Вы: " : "";
  return `${who}${messagePreview(m)}`;
}

// onOpen — что делать по нажатию на строку (по умолчанию — открыть переписку;
// архив подменяет его, чтобы список архива остался рядом, см. views/archive.js).
// onRead — после «Отметить как прочитанное», чтобы владелец списка обновил
// счётчик у себя.
export function ChatListItem({ chat, active, meId, onPatch, onMute, onDelete, onLeave, onOpen, onRead }) {
  const title = chat.type === "dm" ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const online = chat.type === "dm" && chat.otherUser?.online;
  const muted = isChatMuted(chat);

  // data-chat-id — по нему колонка находит строку для перетаскивания
  // закреплённых и для выбора с клавиатуры (views/chatList.js).
  const wrap = el("div", { class: "chat-list-item-wrap with-more", "data-chat-id": chat.id });
  const swipeHint = el("div", { class: "chat-swipe-actions" }, [
    el("span", { class: "chat-swipe-action mute" }, muted ? "Со звуком" : "Без звука"),
    el("span", { class: "chat-swipe-action archive" }, chat.archived ? "Из архива" : "В архив"),
  ]);

  // Свайп по строке — как в мобильном Telegram: потянуть влево, чтобы убрать в
  // архив или заглушить, не открывая меню. На мышке жест недоступен и не нужен:
  // там для этого правая кнопка, поэтому обработчики срабатывают только для
  // пальца и пера.
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
      onpointerdown: (e) => {
        if (e.pointerType === "mouse") return;
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
          // Вертикаль — это прокрутка списка, и перехватывать её нельзя.
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
        // Дотянул до порога — сработало действие. Архив дальше по ходу жеста,
        // чем «без звука», потому что убирают из списка чаще, чем глушат.
        if (dx <= -SWIPE_ACTION_PX * 2) onPatch?.(chat.id, { archived: !chat.archived });
        else if (dx <= -SWIPE_ACTION_PX) onPatch?.(chat.id, { muted: !muted });
      },
      onpointercancel: resetSlide,
    },
    [
      // «Избранное» — закладка в акцентном круге, как в Telegram, а не буква
      // «И»: иначе чат с самим собой выглядит как переписка с кем-то на «И».
      chat.isSaved
        ? el("span", { class: "saved-avatar", html: iconSvg("Bookmark", 24) })
        : Avatar({
            // 52px, а не 44: строка списка стала выше — имя, превью и время в
            // ней читаются с одного взгляда, и аватар под них подогнан, как в
            // Telegram.
            size: 52,
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
          chat.otherUser?.isPremium ? PremiumStar({ size: 15, seed: chat.otherUser.id, title: "Shalter Premium" }) : null,
          ProfileStatusBadge(chat.type === "dm" ? chat.otherUser : chat, 15),
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
          // Красным помечается только слово «Черновик:», а не весь текст: сам
          // набранный текст — обычное превью, и целиком красная строка читалась
          // как ошибка, а не как «здесь недописанное сообщение».
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
              : null,
          ]),
        ]),
      ]),
    ]
  );
  // «⋮» — то же меню, что по правой кнопке. Правый клик на мышке никто не
  // угадывает, а на телефоне его нет вовсе: без этой кнопки единственным путём к
  // «Вернуть из архива» в архиве было знать про него заранее. Кнопка — соседка
  // строки, а не её потомок: кнопка внутри кнопки — недопустимая разметка, и
  // нажатие на неё ещё и открывало бы переписку.
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
      // «Добавить в папку» — как в Telegram: раньше чат попадал в папку только
      // из Настройки → Папки, через список галочек по всем чатам сразу.
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
      chat.unreadCount > 0 || chat.hasUnreadMention
        ? {
            icon: "Check",
            label: "Отметить как прочитанное",
            onClick: async () => {
              try {
                await api.markChatRead(chat.id);
                onRead?.(chat.id);
              } catch (err) {
                alert(err.message || "Не удалось отметить чат прочитанным");
              }
            },
          }
        : null,
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

  // Второе меню на том же месте: список папок с галочкой у тех, где чат уже
  // лежит. Нажатие переключает — кладёт или вынимает.
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
