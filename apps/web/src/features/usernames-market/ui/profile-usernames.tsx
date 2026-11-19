import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, SettingsSection, TextField } from "@/shared/ui";

import { addUsername, pinUsername, setPrimaryUsername, usernamesQueries } from "../api/usernames";

import styles from "./usernames.module.css";

/** Управление несколькими именами прямо в профиле. */
export function ProfileUsernames() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const mine = useQuery(usernamesQueries.mine());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const usernames = mine.data?.usernames ?? [];
  const [selected, setSelected] = useState<(typeof usernames)[number] | null>(null);
  const market = useQuery(usernamesQueries.market());
  const paidByName = new Map((market.data?.owned ?? []).map((item) => [item.username.toLowerCase(), item.priceStars]));
  const normalizedNewUsername = newUsername.trim().replace(/^@/, "");
  const newUsernameValid = /^[A-Za-z0-9_]{3,32}$/.test(normalizedNewUsername);

  const change = async (request: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request();
      setNewUsername("");
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
            <button type="button" className={styles.nameButton} onClick={() => setSelected(item)} aria-label={`Подробнее о @${item.username}`}>
              <span className={styles.name}>@{item.username}</span>
            </button>
            <span className={styles.badges}>
              {item.primary ? <span className={styles.activeBadge}>Основной</span> : null}
              {item.pinned ? <span className={styles.badge}>Закреплён</span> : null}
              {(item.purchasePriceStars ?? paidByName.get(item.username.toLowerCase())) != null ? <span className={styles.priceBadge}>Куплен за {item.purchasePriceStars ?? paidByName.get(item.username.toLowerCase())} ⭐</span> : null}
            </span>
          </div>
          <div className={styles.row}>
            {!item.primary ? <Button variant="secondary" disabled={busy} onClick={() => void change(() => setPrimaryUsername(item.username))}>Сделать основным</Button> : null}
            {!item.primary ? <Button variant="link" disabled={busy} onClick={() => void change(() => pinUsername(item.username, !item.pinned))}>{item.pinned ? "Открепить" : "Закрепить"}</Button> : null}
          </div>
        </div>
      )) : <p className={styles.empty}>Дополнительных юзернеймов пока нет</p>}
      <div className={styles.addUsername}>
        <TextField className={styles.mono} placeholder="новый юзернейм" value={newUsername} onChange={(e) => { setError(null); setNewUsername(e.target.value.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 32)); }} />
        <Button
          variant="secondary"
          disabled={busy || !newUsernameValid}
          onClick={() => {
            if (!newUsernameValid) {
              setError("Юзернейм должен содержать от 3 до 32 латинских символов, цифр или _");
              return;
            }
            void change(() => addUsername(normalizedNewUsername));
          }}
        >
          Добавить свободный
        </Button>
      </div>
      <p className={styles.hint}>Свободное имя добавляется здесь. Купленные имена и их стоимость — в разделе рынка.</p>
      <Button variant="secondary" disabled={busy} onClick={() => void navigate("/settings/usernames")}>Открыть рынок юзернеймов</Button>
      {selected ? (
        <Dialog title={`@${selected.username}`} onClose={() => setSelected(null)}>
          <div className={styles.details}>
            <div className={styles.detailsBadges}>
              {selected.primary ? <span className={styles.activeBadge}>Основной</span> : <span className={styles.badge}>Дополнительный</span>}
              {selected.pinned ? <span className={styles.badge}>Закреплён</span> : <span className={styles.badge}>Не закреплён</span>}
              {selected.purchasePriceStars != null ? <span className={styles.priceBadge}>Куплен за {selected.purchasePriceStars} ⭐</span> : <span className={styles.badge}>Свободный</span>}
            </div>
            <p className={styles.hint}>{selected.purchasePriceStars != null ? "Коллекционный юзернейм принадлежит вашему аккаунту." : "Юзернейм добавлен без покупки."}</p>
            <div className={styles.row}>
              {!selected.primary ? <Button variant="secondary" disabled={busy} onClick={() => void change(() => setPrimaryUsername(selected.username))}>Сделать основным</Button> : null}
              {!selected.primary ? <Button variant="link" disabled={busy} onClick={() => void change(() => pinUsername(selected.username, !selected.pinned))}>{selected.pinned ? "Открепить" : "Закрепить"}</Button> : null}
            </div>
          </div>
        </Dialog>
      ) : null}
    </SettingsSection>
  );
}
