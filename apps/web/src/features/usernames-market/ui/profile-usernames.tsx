import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Button, SettingsSection } from "@/shared/ui";

import { pinUsername, setPrimaryUsername, usernamesQueries } from "../api/usernames";

import styles from "./usernames.module.css";

/** Управление несколькими именами прямо в профиле. */
export function ProfileUsernames() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const mine = useQuery(usernamesQueries.mine());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usernames = mine.data?.usernames ?? [];

  const change = async (request: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request();
      await client.refetchQueries({ queryKey: usernamesQueries.mine().queryKey });
      await client.invalidateQueries({ queryKey: sessionQueries.current().queryKey });
    } catch (err) {
      setError(errorText(err, "Не удалось изменить юзернейм"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Юзернеймы" caption="Основной показывается в профиле. Дополнительные можно переключать и закреплять.">
      {error ? <p className={styles.error}>{error}</p> : null}
      {usernames.length ? usernames.map((item) => (
        <div key={item.username} className={styles.card}>
          <div className={styles.head}>
            <span className={styles.name}>@{item.username}</span>
            <span className={styles.badges}>
              {item.primary ? <span className={styles.activeBadge}>Основной</span> : null}
              {item.pinned ? <span className={styles.badge}>Закреплён</span> : null}
            </span>
          </div>
          <div className={styles.row}>
            {!item.primary ? <Button variant="secondary" disabled={busy} onClick={() => void change(() => setPrimaryUsername(item.username))}>Сделать основным</Button> : null}
            {!item.primary ? <Button variant="link" disabled={busy} onClick={() => void change(() => pinUsername(item.username, !item.pinned))}>{item.pinned ? "Открепить" : "Закрепить"}</Button> : null}
          </div>
        </div>
      )) : <p className={styles.empty}>Дополнительных юзернеймов пока нет</p>}
      <Button variant="secondary" disabled={busy} onClick={() => void navigate("/settings/usernames")}>Добавить или купить юзернейм</Button>
    </SettingsSection>
  );
}
