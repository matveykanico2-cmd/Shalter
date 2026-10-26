import { useState } from "react";

import { type ChatSummary, isChatAdmin, isChatModerator } from "@/entities/chat";
import { type Message, messagePreview } from "@/entities/message";
import { isServerModerator, type SelfUser } from "@/entities/session";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { Icon, toast } from "@/shared/ui";

import { isProtectedChat } from "../lib/permissions";
import type { useMessageActions } from "../model/use-message-actions";

import { DeleteMessageDialog } from "./delete-message-dialog";
import { ForwardDialog } from "./forward-dialog";
import styles from "./message-actions.module.css";

type Props = {
  /** Выбранные — в порядке ленты. */
  messages: readonly Message[];
  chat: ChatSummary;
  me: SelfUser;
  actions: ReturnType<typeof useMessageActions>;
  senderName: (m: Message) => string | null;
  onClear: () => void;
};

/** «Выбрано: N» над лентой — как renderSelectionBar в public/js/views/chatView.js. */
export function SelectionBar({ messages, chat, me, actions, senderName, onClear }: Props) {
  const [dialog, setDialog] = useState<"forward" | "delete" | null>(null);
  const isDm = chat.type === "dm";
  const allMine = messages.every((m) => m.senderId === me.id);
  const canDeleteForAll = allMine || (!isDm && (isChatAdmin(chat, me.id) || isChatModerator(chat, me.id))) || isServerModerator(me);
  const protectedContent = isProtectedChat(chat);
  const count = messages.length;

  const copy = () => {
    const text = messages.map((m) => `${senderName(m) ?? ""}: ${messagePreview(m)}`.trim()).join("\n");
    onClear();
    void copyText(text, "Сообщения скопированы");
  };

  const forward = async (ids: string[], hideAuthor: boolean, progress: (done: number) => void) => {
    const chatTitle = (isDm ? chat.otherUser?.name : null) ?? chat.title ?? "";
    let failed = 0;
    let lastError: unknown = null;
    for (const [i, target] of ids.entries()) {
      for (const m of messages) {
        const r = await actions.forward(m, [target], { chatId: chat.id, chatTitle, senderName: senderName(m) ?? "Аноним" }, hideAuthor);
        failed += r.failed;
        lastError = r.lastError ?? lastError;
      }
      progress(i + 1);
    }
    onClear();
    if (failed) toast(`${errorText(lastError, "Не удалось отправить")} (не ушло: ${failed})`, { error: true });
  };

  const remove = async (forEveryone: boolean) => {
    onClear();
    for (const m of messages) await actions.remove(m, forEveryone);
  };

  return (
    <div className={styles.selectionBar} role="toolbar" aria-label="Выбранные сообщения">
      <button type="button" className={styles.barButton} title="Отменить" onClick={onClear}>
        <Icon name="X" size={18} />
      </button>
      <span className={styles.selectionCount}>Выбрано: {count}</span>
      {!protectedContent ? (
        <>
          <button type="button" className={styles.barButton} title="Копировать" onClick={copy}>
            <Icon name="Copy" size={17} />
          </button>
          <button type="button" className={styles.barButton} title="Переслать" onClick={() => setDialog("forward")}>
            <Icon name="Forward" size={17} />
          </button>
        </>
      ) : null}
      <button type="button" className={`${styles.barButton} ${styles.barDanger}`} title="Удалить" onClick={() => setDialog("delete")}>
        <Icon name="Trash" size={17} />
      </button>
      {dialog === "forward" ? <ForwardDialog count={count} onSend={forward} onClose={() => setDialog(null)} /> : null}
      {dialog === "delete" ? (
        <DeleteMessageDialog count={count} canDeleteForEveryone={canDeleteForAll} someoneElses={!allMine} onDelete={(fe) => void remove(fe)} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
