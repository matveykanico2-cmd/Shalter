import { type KeyboardEvent, useRef, useState } from "react";

import { Button, Dialog, Icon } from "@/shared/ui";

import styles from "./create-dialogs.module.css";

const MAX_ITEMS = 30;

export type ChecklistDraft = { title: string; items: string[]; othersCanMark: boolean; othersCanAdd: boolean };

/** «Новый чек-лист» — как public/js/components/checklistDialog.js; Enter в последнем пункте добавляет ещё. */
export function ChecklistDialog({ onCreate, onClose }: { onCreate: (list: ChecklistDraft) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState(["", "", ""]);
  const [othersCanMark, setMark] = useState(true);
  const [othersCanAdd, setAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const addItem = () => {
    setItems((all) => (all.length < MAX_ITEMS ? [...all, ""] : all));
    setTimeout(() => list.current?.querySelectorAll("input")[items.length]?.focus(), 0);
  };
  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems((all) => all.filter((_, i) => i !== index));
  };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === "Enter" && i === items.length - 1 && items.length < MAX_ITEMS) {
      e.preventDefault();
      addItem();
    }
  };
  const create = () => {
    const filled = items.map((t) => t.trim()).filter(Boolean);
    if (!filled.length) return setError("Добавьте хотя бы один пункт");
    onClose();
    onCreate({ title: title.trim() || "Чек-лист", items: filled, othersCanMark, othersCanAdd });
  };

  return (
    <Dialog title="Новый чек-лист" onClose={onClose} className={styles.checklistDialog}>
      <input className={styles.input} placeholder="Название списка" aria-label="Название списка" maxLength={200} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className={`${styles.list} ${styles.checklistList}`} ref={list}>
        {items.map((value, i) => (
          <div key={i} className={styles.checklistRow}>
            <input
              className={styles.input}
              placeholder={`Пункт ${i + 1}`}
              aria-label={`Пункт ${i + 1}`}
              maxLength={200}
              value={value}
              onKeyDown={onKey(i)}
              onChange={(e) => setItems((all) => all.map((t, j) => (j === i ? e.target.value : t)))}
            />
            {items.length > 1 ? (
              <button type="button" className={styles.removeOption} title="Удалить пункт" aria-label={`Удалить пункт ${i + 1}`} onClick={() => removeItem(i)}>
                <Icon name="X" size={15} />
              </button>
            ) : null}
          </div>
        ))}
        {items.length < MAX_ITEMS ? (
          <button type="button" className={styles.add} onClick={addItem}>
            + Добавить пункт
          </button>
        ) : null}
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={othersCanMark} onChange={(e) => setMark(e.target.checked)} />
        <span>Другие могут отмечать пункты</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={othersCanAdd} onChange={(e) => setAdd(e.target.checked)} />
        <span>Другие могут добавлять пункты</span>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button onClick={create}>Создать</Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
