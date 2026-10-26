import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { userQueries } from "@/entities/user";

import { http } from "@/shared/api";
import { Avatar, Button, Dialog, Icon, TextField } from "@/shared/ui";

import styles from "./privacy.module.css";

export type Exceptions = { allow: string[]; deny: string[] };

type Person = { id: string; name?: string | null; username?: string | null; phone?: string | null; avatarColor?: string | null; avatarImage?: string | null };

const nameOf = (u: Person) => u.name || u.username || u.phone || "Без имени";
const matches = (u: Person, q: string) => nameOf(u).toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q);

type Props = { title: string; value?: Exceptions; onSave: (value: Exceptions) => void; onClose: () => void };

/** Кому правило не действует — openPrivacyExceptionsDialog (components/privacyExceptionsDialog.js). */
export function ExceptionsDialog({ title, value, onSave, onClose }: Props) {
  const [allow, setAllow] = useState(() => new Set(value?.allow ?? []));
  const [deny, setDeny] = useState(() => new Set(value?.deny ?? []));
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const contactsQuery = useQuery(userQueries.contacts());
  const contacts: Person[] | null = contactsQuery.data ?? (contactsQuery.isError ? [] : null);
  const search = useQuery({
    queryKey: ["privacy-settings", "search", q],
    queryFn: async ({ signal }) => (await http.get<{ users?: Person[] }>(`/api/search?q=${encodeURIComponent(q)}`, signal)).users ?? [],
    enabled: !!q,
  });
  // Кого уже видели (контакты, поиск) — чтобы показывать выбранных по имени.
  const [seen] = useState(() => new Map<string, Person>());
  for (const u of [...(contacts ?? []), ...(search.data ?? [])]) seen.set(u.id, u);

  const set = (id: string, next: "allow" | "deny" | "") => {
    const a = new Set(allow);
    const d = new Set(deny);
    a.delete(id);
    d.delete(id);
    if (next === "allow") a.add(id);
    if (next === "deny") d.add(id);
    setAllow(a);
    setDeny(d);
  };
  const notChosen = (u: Person) => !allow.has(u.id) && !deny.has(u.id);

  const personRow = (u: Person) => {
    const state = deny.has(u.id) ? "deny" : allow.has(u.id) ? "allow" : "";
    return (
      <div key={u.id} className={styles.excRow}>
        <Avatar name={nameOf(u)} color={u.avatarColor} image={u.avatarImage} size={32} />
        <div className={styles.userBody}>
          <span className={styles.userName}>{nameOf(u)}</span>
          {u.username ? <span className={`${styles.muted} ${styles.mono}`}>@{u.username}</span> : null}
        </div>
        <button
          type="button"
          className={`${styles.excButton} ${styles.excAllowBtn}`}
          title="Всегда можно"
          aria-label="Всегда можно"
          aria-pressed={state === "allow"}
          onClick={() => set(u.id, state === "allow" ? "" : "allow")}
        >
          <Icon name="Check" size={14} />
        </button>
        <button
          type="button"
          className={`${styles.excButton} ${styles.excDenyBtn}`}
          title="Никогда"
          aria-label="Никогда"
          aria-pressed={state === "deny"}
          onClick={() => set(u.id, state === "deny" ? "" : "deny")}
        >
          <Icon name="X" size={14} />
        </button>
      </div>
    );
  };
  const unknownRow = (id: string) => (
    <div key={id} className={styles.excRow}>
      <div className={styles.userBody}>
        <span className={styles.userName}>Удалённый аккаунт</span>
      </div>
      <button type="button" className={styles.excButton} title="Убрать из списка" aria-label="Убрать из списка" onClick={() => set(id, "")}>
        <Icon name="Trash" size={14} />
      </button>
    </div>
  );

  const groups = [
    { ids: [...allow], label: "Всегда можно", cls: styles.excAllow },
    { ids: [...deny], label: "Никогда", cls: styles.excDeny },
  ].filter((g) => g.ids.length);

  const results = useMemo(() => {
    if (!q) return null;
    const contactIds = new Set((contacts ?? []).map((u) => u.id));
    return {
      mine: (contacts ?? []).filter(notChosen).filter((u) => matches(u, q)),
      others: (search.data ?? []).filter(notChosen).filter((u) => !contactIds.has(u.id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, contacts, search.data, allow, deny]);

  let list;
  if (!results) {
    if (contacts === null) list = <p className={styles.hint}>Загружаем контакты…</p>;
    else {
      const rest = contacts.filter(notChosen);
      list = rest.length ? (
        <>
          <p className={styles.excGroup}>Ваши контакты — {rest.length}</p>
          {rest.map(personRow)}
        </>
      ) : (
        <p className={styles.hint}>{contacts.length ? "Все ваши контакты уже в списках выше" : "Список контактов пуст — найдите человека по имени или @юзернейму"}</p>
      );
    }
  } else if (!results.mine.length && !results.others.length) {
    list = search.isFetching ? null : <p className={styles.hint}>Никого не найдено — возможно, они уже в списках выше</p>;
  } else {
    list = (
      <>
        {results.mine.length ? <p className={styles.excGroup}>Из ваших контактов</p> : null}
        {results.mine.map(personRow)}
        {results.others.length ? <p className={styles.excGroup}>Остальные аккаунты</p> : null}
        {results.others.map(personRow)}
      </>
    );
  }

  return (
    <Dialog title={title} onClose={onClose} className={styles.excDialog}>
      <p className={styles.hint}>
        «Всегда можно» действует даже когда правило запрещает, «Никогда» — даже когда правило разрешает всем. Запрет сильнее разрешения.
      </p>
      <div>
        {groups.length ? (
          groups.map((g) => (
            <div key={g.label}>
              <p className={`${styles.excGroup} ${g.cls}`}>
                {g.label} — {g.ids.length}
              </p>
              {g.ids.map((id) => {
                const u = seen.get(id);
                return u ? personRow(u) : unknownRow(id);
              })}
            </div>
          ))
        ) : (
          <p className={styles.hint}>Исключений нет — правило действует на всех одинаково</p>
        )}
      </div>
      <TextField type="search" placeholder="Поиск по контактам и аккаунтам" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div>{list}</div>
      <Button
        onClick={() => {
          onClose();
          onSave({ allow: [...allow], deny: [...deny] });
        }}
      >
        Сохранить
      </Button>
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
