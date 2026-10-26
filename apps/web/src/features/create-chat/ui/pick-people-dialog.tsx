import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { type Contact, userQueries } from "@/entities/user";

import { Avatar, Button, Dialog, Icon } from "@/shared/ui";

import styles from "./create-chat.module.css";

type Props = {
  title: string;
  submitLabel: string;
  /** Один человек — сразу по нажатию (новый чат); иначе галочки и «Далее». */
  single?: boolean;
  /** Сразу назначить администраторов (allowRoles в memberPickerDialog.js). */
  allowRoles?: boolean;
  exclude?: readonly string[];
  onPick: (picked: { people: Contact[]; adminIds: string[] }) => void;
  onClose: () => void;
};

/** Выбор из контактов — memberPickerDialog.js и contactPickerDialog.js: поиск, галочки, админы. */
export function PickPeopleDialog({ title, submitLabel, single = false, allowRoles = false, exclude = [], onPick, onClose }: Props) {
  const contacts = useQuery(userQueries.contacts());
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlyMap<string, Contact>>(new Map());
  const [admins, setAdmins] = useState<ReadonlySet<string>>(new Set());
  const people = (contacts.data ?? []).filter((u) => !exclude.includes(u.id)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((u) => `${u.name} ${u.username ?? ""}`.toLowerCase().includes(q)) : people;

  const toggle = (u: Contact) => {
    if (single) return onPick({ people: [u], adminIds: [] });
    setPicked((prev) => {
      const next = new Map(prev);
      if (!next.delete(u.id)) next.set(u.id, u);
      return next;
    });
    setAdmins((prev) => {
      const next = new Set(prev);
      next.delete(u.id);
      return next;
    });
  };
  const toggleAdmin = (id: string) =>
    setAdmins((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Dialog title={title} onClose={onClose}>
      <input className={styles.search} placeholder={single ? "Поиск" : "Кого добавить?"} aria-label={single ? "Поиск" : "Кого добавить?"} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className={styles.people}>
        {contacts.isPending ? (
          <p className={styles.hint}>Загружаем…</p>
        ) : !people.length ? (
          <p className={styles.hint}>Список контактов пуст — сначала добавьте людей в контакты.</p>
        ) : !shown.length ? (
          <p className={styles.hint}>Никого не нашлось</p>
        ) : (
          shown.map((u) => {
            const checked = picked.has(u.id);
            const admin = admins.has(u.id);
            return (
              <div key={u.id} className={styles.personRow}>
                <button type="button" role={single ? undefined : "checkbox"} aria-checked={single ? undefined : checked} className={styles.person} onClick={() => toggle(u)}>
                  <Avatar size={40} name={u.name} color={u.avatarColor} image={u.avatarImage} />
                  <span className={styles.personText}>
                    <span>{u.name}</span>
                    {admin ? <span className={styles.hint}>администратор</span> : u.username ? <span className={styles.hint}>@{u.username}</span> : null}
                  </span>
                  {single ? null : <span className={checked ? `${styles.check} ${styles.checked}` : styles.check}>{checked ? <Icon name="Check" size={14} /> : null}</span>}
                </button>
                {allowRoles && checked ? (
                  <button
                    type="button"
                    className={admin ? `${styles.adminToggle} ${styles.adminOn}` : styles.adminToggle}
                    title={admin ? "Администратор" : "Сделать администратором"}
                    aria-pressed={admin}
                    onClick={() => toggleAdmin(u.id)}
                  >
                    <Icon name="Shield" size={16} />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {single ? (
        <Button variant="link" onClick={onClose}>
          Отмена
        </Button>
      ) : (
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => onPick({ people: [...picked.values()], adminIds: [...admins] })}>{submitLabel}</Button>
        </div>
      )}
    </Dialog>
  );
}
