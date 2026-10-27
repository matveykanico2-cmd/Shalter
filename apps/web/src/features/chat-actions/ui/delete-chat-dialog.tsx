import { useState } from "react";

import { type ChatSummary, chatTitle, isChatAdmin } from "@/entities/chat";

import { Button, Dialog } from "@/shared/ui";

import styles from "./chat-actions.module.css";

type Props = {
  chat: ChatSummary;
  meId: string;
  /** Модератор Shalter в чужой группе или канале — может удалить её для всех. */
  moderator: boolean;
  onDelete: (forEveryone: boolean) => void;
  onLeave: () => void;
  onClose: () => void;
};

/** «Удалить чат» / «Покинуть группу» — как public/js/components/deleteChatDialog.js. */
export function DeleteChatDialog({ chat, meId, moderator, onDelete, onLeave, onClose }: Props) {
  const [forEveryone, setForEveryone] = useState(false);
  const isDmLike = chat.type === "dm" || chat.type === "bot";
  const isChannel = chat.type === "channel";
  const what = isChannel ? "канал" : "группу";
  const admin = isChatAdmin(chat, meId);
  const name = chatTitle(chat);

  let title = isChannel ? "Удалить канал" : "Удалить группу";
  let text: string;
  let checkbox: string | null = null;
  let confirmLabel = "Удалить";
  let canLeave = false;
  if (isDmLike) {
    title = "Удалить чат";
    const self = chat.isSaved || chat.otherUser?.id === meId;
    if (self) text = "Удалить «Избранное»? Все сохранённые в нём сообщения пропадут.";
    else {
      const who = chat.otherUser?.name ?? (chat.title || "собеседником");
      text = `Удалить чат с ${who}?`;
      checkbox = `Также удалить для ${who}`;
    }
  } else if (admin || moderator) {
    text = `Удалить ${what} «${name}»?`;
    checkbox = moderator && !admin ? "Удалить для всех участников (модерация)" : "Удалить для всех участников";
    canLeave = admin;
  } else {
    text = `Удалить ${what} «${name}» из списка чатов? Вы останетесь ${isChannel ? "подписчиком" : "участником"}, и чат вернётся с новым сообщением.`;
    confirmLabel = "Удалить у себя";
    canLeave = true;
  }
  // «Избранное» удаляется только целиком.
  const everyone = isDmLike && !checkbox ? true : !!checkbox && forEveryone;

  return (
    <Dialog title={title} onClose={onClose}>
      <p className={styles.text}>{text}</p>
      {checkbox ? (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={forEveryone} onChange={(e) => setForEveryone(e.target.checked)} />
          <span>{checkbox}</span>
        </label>
      ) : null}
      <Button
        variant="danger"
        onClick={() => {
          onClose();
          onDelete(everyone);
        }}
      >
        {confirmLabel}
      </Button>
      {canLeave ? (
        <Button
          variant="danger"
          onClick={() => {
            onClose();
            onLeave();
          }}
        >
          {isChannel ? "Покинуть канал" : "Покинуть группу"}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
