import { useState } from "react";

import { Button, Dialog } from "@/shared/ui";

import styles from "./message-actions.module.css";

type Props = {
  canDeleteForEveryone: boolean;
  someoneElses: boolean;
  onDelete: (forEveryone: boolean) => void;
  onClose: () => void;
};

/** «Удалить сообщение?» — как public/js/components/deleteMessageDialog.js. */
export function DeleteMessageDialog({ canDeleteForEveryone, someoneElses, onDelete, onClose }: Props) {
  const [forEveryone, setForEveryone] = useState(false);
  return (
    <Dialog title="Удалить сообщение?" onClose={onClose}>
      {canDeleteForEveryone ? (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={forEveryone} onChange={(e) => setForEveryone(e.target.checked)} />
          <span>
            <span className={styles.checkTitle}>Удалить у всех</span>
            <span className={styles.hint}>
              {someoneElses
                ? "Сообщение исчезнет у собеседника и с сервера — вместе с вложениями."
                : "Сообщение исчезнет у всех участников и с сервера — вместе с вложениями."}
            </span>
          </span>
        </label>
      ) : (
        <p className={styles.hint}>Чужое сообщение можно убрать только из своей переписки.</p>
      )}
      <Button
        variant="danger"
        onClick={() => {
          onClose();
          onDelete(canDeleteForEveryone && forEveryone);
        }}
      >
        Удалить
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
