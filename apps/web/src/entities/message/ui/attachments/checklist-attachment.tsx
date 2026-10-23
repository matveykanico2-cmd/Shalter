import { askText } from "@/shared/ui";

import { checklistMeta } from "../../lib/poll";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage as Message } from "../../model/types";

import styles from "./interactive.module.css";

const MAX_ITEMS = 30;

export type ChecklistActions = {
  onToggle?: (m: Message, itemId: number) => void;
  onAdd?: (m: Message, texts: string[]) => void;
};

type Props = { message: Message; attachment: Attachment; meId: string; nameOf: (userId: string) => string } & ChecklistActions;

/** Чек-лист — ChecklistAttachment из messageBubble.js: кто отметил пункт, «+ Добавить пункт». */
export function ChecklistAttachment({ message: m, attachment, meId, nameOf, onToggle, onAdd }: Props) {
  const meta = checklistMeta(attachment);
  const author = m.senderId === meId;
  const canMark = (author || meta.othersCanMark !== false) && !!onToggle;
  const canAdd = (author || !!meta.othersCanAdd) && meta.items.length < MAX_ITEMS && !!onAdd;
  const done = meta.items.filter((it) => it.doneBy).length;
  return (
    <div className={styles.checklist}>
      <p className={styles.question}>{m.text || "Чек-лист"}</p>
      <p className={styles.kind}>
        Выполнено {done} из {meta.items.length}
      </p>
      <div className={styles.items}>
        {meta.items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={it.doneBy ? `${styles.item} ${styles.done}` : styles.item}
            disabled={!canMark || m.pending}
            aria-pressed={!!it.doneBy}
            title={it.doneBy ? `Отметил(а): ${it.doneBy === meId ? "вы" : nameOf(it.doneBy)}` : ""}
            onClick={() => onToggle?.(m, it.id)}
          >
            <span className={styles.box}>{it.doneBy ? "✓" : ""}</span>
            <span className={styles.itemText}>{it.text}</span>
            {it.doneBy && it.doneBy !== m.senderId ? <span className={styles.by}>{it.doneBy === meId ? "вы" : nameOf(it.doneBy)}</span> : null}
          </button>
        ))}
      </div>
      {canAdd && !m.pending ? (
        <button
          type="button"
          className={styles.action}
          onClick={async () => {
            const text = await askText("Новый пункт");
            if (text?.trim()) onAdd?.(m, [text.trim()]);
          }}
        >
          + Добавить пункт
        </button>
      ) : null}
    </div>
  );
}
