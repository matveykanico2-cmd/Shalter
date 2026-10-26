import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { ChatSummary } from "@/entities/chat";

import { Avatar, Button, Dialog, Icon } from "@/shared/ui";

import { contactsQuery } from "../api/members";
import { useMemberActions } from "../model/use-member-actions";

import styles from "./manage-members.module.css";

type Props = { chat: ChatSummary; meId: string; onClose: () => void };

/** «Добавить участников» из контактов — как openMemberPickerDialog (public/js/components/memberPickerDialog.js). */
export function AddMembersDialog({ chat, meId, onClose }: Props) {
  const contacts = useQuery(contactsQuery());
  const actions = useMemberActions(chat, meId);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const members = new Set(chat.memberIds);
    return (contacts.data ?? []).filter((u) => !members.has(u.id)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [contacts.data, chat.memberIds]);
  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((u) => `${u.name} ${u.username ?? ""}`.toLowerCase().includes(q)) : people;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    await actions.add([...picked]);
    onClose();
  };

  return (
    <Dialog title="Добавить участников" onClose={onClose}>
      <input className={styles.search} placeholder="Кого добавить?" aria-label="Кого добавить?" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className={styles.people}>
        {contacts.isPending ? (
          <p className={styles.hint}>Загружаем…</p>
        ) : !people.length ? (
          <p className={styles.hint}>Список контактов пуст — сначала добавьте людей в контакты.</p>
        ) : !shown.length ? (
          <p className={styles.hint}>Никого не нашлось</p>
        ) : (
          <>
            <p className={styles.caption}>Контакты</p>
            {shown.map((u) => {
              const checked = picked.has(u.id);
              return (
                <button key={u.id} type="button" role="checkbox" aria-checked={checked} className={styles.person} onClick={() => toggle(u.id)}>
                  <Avatar size={40} name={u.name} color={u.avatarColor} image={u.avatarImage} />
                  <span className={styles.personText}>
                    <span>{u.name}</span>
                    {u.username ? <span className={styles.hint}>@{u.username}</span> : null}
                  </span>
                  <span className={checked ? `${styles.check} ${styles.checked}` : styles.check}>{checked ? <Icon name="Check" size={14} /> : null}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={!picked.size || busy} onClick={() => void submit()}>
          Добавить
        </Button>
      </div>
    </Dialog>
  );
}
