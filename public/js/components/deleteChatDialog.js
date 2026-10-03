import { askConfirm } from "./confirmDialog.js";
import { openCheckboxDialog } from "./confirmDialog.js";
import { isChatAdmin } from "../lib/chatRoles.js";

export function openDeleteChatDialog(chat, meId, { onDelete, onLeave, moderator = false } = {}) {
  const isDmLike = chat.type === "dm" || chat.type === "bot";

  if (isDmLike) {
    const self = chat.otherUser?.id === meId || (chat.memberIds?.length === 1 && chat.memberIds[0] === meId);
    if (self) {
      return openCheckboxDialog({
        title: "Удалить чат",
        text: "Удалить «Избранное»? Все сохранённые в нём сообщения пропадут.",
        confirmLabel: "Удалить",
        danger: true,
        onConfirm: () => onDelete?.(true),
      });
    }
    const name = chat.otherUser?.name ?? chat.title ?? "собеседником";
    return openCheckboxDialog({
      title: "Удалить чат",
      text: `Удалить чат с ${name}?`,
      checkbox: { label: `Также удалить для ${name}`, checked: false },
      confirmLabel: "Удалить",
      danger: true,
      onConfirm: (forEveryone) => onDelete?.(forEveryone),
    });
  }

  const isChannel = chat.type === "channel";
  const what = isChannel ? "канал" : "группу";
  const title = chat.title ?? chat.name ?? "";
  const admin = isChatAdmin(chat, meId);
  const leave = onLeave
    ? [{ label: isChannel ? "Покинуть канал" : "Покинуть группу", danger: true, onClick: () => onLeave() }]
    : [];

  if (admin || moderator) {
    return openCheckboxDialog({
      title: isChannel ? "Удалить канал" : "Удалить группу",
      text: `Удалить ${what} «${title}»?`,
      checkbox: { label: moderator && !admin ? "Удалить для всех участников (модерация)" : "Удалить для всех участников", checked: false },
      confirmLabel: "Удалить",
      danger: true,
      extra: admin ? leave : [],
      onConfirm: async (forEveryone) => {
        if (forEveryone && moderator && !admin) {
          const ok = (await askConfirm(`Удалить чужой ${what} «${title}» за нарушение правил? Все сообщения и файлы пропадут у всех, владельцу придёт уведомление. Это необратимо.`));
          if (!ok) return;
        }
        onDelete?.(forEveryone);
      },
    });
  }

  return openCheckboxDialog({
    title: isChannel ? "Удалить канал" : "Удалить группу",
    text: `Удалить ${what} «${title}» из списка чатов? Вы останетесь ${isChannel ? "подписчиком" : "участником"}, и чат вернётся с новым сообщением.`,
    confirmLabel: "Удалить у себя",
    danger: true,
    extra: leave,
    onConfirm: () => onDelete?.(false),
  });
}
