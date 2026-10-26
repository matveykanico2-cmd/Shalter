import { useQuery } from "@tanstack/react-query";

import { Avatar, Button, Dialog } from "@/shared/ui";

import { userQueries } from "../api/user-queries";

import styles from "./contact-picker.module.css";

export type PickedContact = { id: string; name: string; phone?: string | null; avatarColor?: string | null; avatarImage?: string | null };

const NONE: readonly PickedContact[] = [];

type Props = {
  title: string;
  /** Кроме контактов — например, участники чата. */
  extra?: readonly PickedContact[];
  /** Кого не предлагать: собеседника в личке, себя. */
  exclude: readonly string[];
  onPick: (user: PickedContact) => void;
  onClose: () => void;
};

/** Выбор человека из контактов — как public/js/components/contactPickerDialog.js. */
export function ContactPicker({ title, extra = NONE, exclude, onPick, onClose }: Props) {
  const contacts = useQuery(userQueries.contacts());
  // Ошибка загрузки — остаются только extra.
  const loaded = contacts.data ?? (contacts.isError ? [] : null);
  const people = loaded
    ? [...loaded, ...extra.filter((u) => !loaded.some((c) => c.id === u.id))].filter((u) => !exclude.includes(u.id))
    : null;
  return (
    <Dialog title={title} onClose={onClose}>
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
