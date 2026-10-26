import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Icon, toast } from "@/shared/ui";

import { addContact } from "../api/contact-bar";
import { dismiss, isDismissed } from "../lib/dismissed";

import styles from "./contact-bar.module.css";

type Props = { chat: ChatSummary; blocked: boolean; onToggleBlock: () => Promise<void> };

/**
 * Личка с человеком не из контактов — «Добавить в контакты» и «Заблокировать», как
 * renderContactBar в public/js/views/chatView.js; крестик прячет плашку для этого чата.
 */
export function ContactBar({ chat, blocked, onToggleBlock }: Props) {
  const client = useQueryClient();
  const [hidden, setHidden] = useState(() => isDismissed(chat.id));
  const [added, setAdded] = useState(false);
  const other = chat.otherUser;
  if (chat.type !== "dm" || chat.isSaved || !other || other.isBot || other.isServiceBot || other.inContacts || hidden || added) return null;

  const add = async () => {
    const name = (await askText("Как записать в контактах?", { initial: other.name }))?.trim();
    if (name === undefined) return;
    try {
      const sharePhone = await askConfirm(`Поделиться своим номером телефона с ${other.name}?`, { okLabel: "Поделиться", cancelLabel: "Не делиться" });
      await addContact(other.id, name || null, sharePhone);
      setAdded(true);
      void client.invalidateQueries({ queryKey: chatQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось добавить в контакты"), { error: true });
    }
  };
  const block = async () => {
    if (!blocked && !(await askConfirm(`Заблокировать ${other.name}? Он(а) не сможет писать и звонить вам.`))) return;
    await onToggleBlock();
  };

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.button} onClick={() => void add()}>
        Добавить в контакты
      </button>
      <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => void block()}>
        {blocked ? "Разблокировать" : "Заблокировать"}
      </button>
      <button
        type="button"
        className={styles.close}
        title="Скрыть"
        onClick={() => {
          dismiss(chat.id);
          setHidden(true);
        }}
      >
        <Icon name="X" size={15} />
      </button>
    </div>
  );
}
