import { useEffect, useState } from "react";

import { Avatar, Button, Dialog } from "@/shared/ui";

import { listContacts } from "../api/send-message";

import styles from "./create-dialogs.module.css";

export type PickedContact = { id: string; name: string; phone?: string | null; avatarColor?: string | null; avatarImage?: string | null };

type Props = {
  /** Участники чата — тоже можно отправить, даже если их нет в контактах. */
  extra: readonly PickedContact[];
  /** Кого не предлагать: собеседника в личке. */
  exclude: readonly string[];
  onPick: (user: PickedContact) => void;
  onClose: () => void;
};

/** «Отправить контакт» — как public/js/components/contactPickerDialog.js. */
export function ContactPicker({ extra, exclude, onPick, onClose }: Props) {
  const [people, setPeople] = useState<PickedContact[] | null>(null);
  useEffect(() => {
    let alive = true;
    const merge = (contacts: PickedContact[]) => {
      const seen = new Set(contacts.map((u) => u.id));
      const skip = new Set(exclude);
      return [...contacts, ...extra.filter((u) => !seen.has(u.id))].filter((u) => !skip.has(u.id));
    };
    listContacts().then(
      ({ contacts }) => alive && setPeople(merge(contacts.map((c) => c.user))),
      () => alive && setPeople(merge([]))
    );
    return () => {
      alive = false;
    };
  }, [extra, exclude]);

  return (
    <Dialog title="Отправить контакт" onClose={onClose}>
      <div className={styles.people}>
        {people === null ? (
          <p className={styles.hint}>Загружаем…</p>
        ) : people.length ? (
          people.map((u) => (
            <button
              key={u.id}
              type="button"
              className={styles.person}
              onClick={() => {
                onClose();
                onPick(u);
              }}
            >
              <Avatar size={36} name={u.name} color={u.avatarColor} image={u.avatarImage} />
              <span>{u.name}</span>
            </button>
          ))
        ) : (
          <p className={styles.hint}>Список контактов пуст</p>
        )}
      </div>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
