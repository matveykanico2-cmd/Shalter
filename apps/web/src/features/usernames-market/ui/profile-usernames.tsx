import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Button, Dialog, SettingsSection, TextField } from "@/shared/ui";

import { addUsername, pinUsername, removeUsername, renameUsername, setPrimaryUsername, usernamesQueries } from "../api/usernames";

import styles from "./usernames.module.css";

function usernameKind(priceStars?: number) {
  if (!priceStars) return "Бесплатный";
  return priceStars >= 1000 ? "Редкий" : "Платный";
}

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

  const edit = async (current: string) => {
    const next = await askText(`Новое имя вместо @${current}`, { initial: current, placeholder: "новый юзернейм", okLabel: "Сохранить" });
    const normalized = (next ?? "").trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{3,32}$/.test(normalized) || normalized.toLowerCase() === current.toLowerCase()) return;
    setSelected(null);
    await change(() => renameUsername(current, normalized));
  };

  const remove = async (username: string) => {
    if (!(await askConfirm(`Удалить юзернейм @${username}?`, { okLabel: "Удалить", danger: true }))) return;
    setSelected(null);
    const result = await change(() => removeUsername(username)) as { generatedUsername?: string } | undefined;
    if (result?.generatedUsername) {
      const replacement = await askText(`У вас не осталось юзернеймов. Временно установлен @${result.generatedUsername}. Введите новый юзернейм:`, { initial: result.generatedUsername, placeholder: "новый юзернейм", okLabel: "Изменить" });
      const normalized = (replacement ?? "").trim().replace(/^@/, "");
      if (/^[A-Za-z0-9_]{3,32}$/.test(normalized) && normalized.toLowerCase() !== result.generatedUsername.toLowerCase()) {
        await change(() => renameUsername(result.generatedUsername!, normalized));
      }
    }
  };

  const runEdit = (username: string) => {
    void edit(username);
  };

  const change = async (request: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      setNewUsername("");
      await client.refetchQueries({ queryKey: usernamesQueries.mine().queryKey });
      await client.invalidateQueries({ queryKey: sessionQueries.current().queryKey });
      return result;
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
              {(item.purchasePriceStars ?? paidByName.get(item.username.toLowerCase())) != null ? <span className={styles.priceBadge}>{usernameKind(item.purchasePriceStars ?? paidByName.get(item.username.toLowerCase()))} · куплен за {item.purchasePriceStars ?? paidByName.get(item.username.toLowerCase())} ⭐</span> : <span className={styles.badge}>{usernameKind()}</span>}
            </span>
          </div>
          <div className={styles.row}>
            <Button variant="link" disabled={busy} onClick={() => runEdit(item.username)}>Редактировать</Button>
            <Button variant="link" className={styles.dangerLink} disabled={busy} onClick={() => void remove(item.username)}>Удалить</Button>
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
          Добавить бесплатный
        </Button>
      </div>
      <p className={styles.hint}>Бесплатное имя добавляется здесь. Платные и редкие имена, а также их стоимость — в разделе рынка.</p>
      <Button variant="secondary" disabled={busy} onClick={() => void navigate("/settings/usernames")}>Открыть рынок юзернеймов</Button>
      {selected ? (
        <Dialog title={`@${selected.username}`} onClose={() => setSelected(null)}>
          <div className={styles.details}>
            <div className={styles.detailsBadges}>
              {selected.primary ? <span className={styles.activeBadge}>Основной</span> : <span className={styles.badge}>Дополнительный</span>}
              {selected.pinned ? <span className={styles.badge}>Закреплён</span> : <span className={styles.badge}>Не закреплён</span>}
              {selected.purchasePriceStars != null ? <span className={styles.priceBadge}>{usernameKind(selected.purchasePriceStars)} · куплен за {selected.purchasePriceStars} ⭐</span> : <span className={styles.badge}>{usernameKind()}</span>}
            </div>
            <p className={styles.hint}>{selected.purchasePriceStars != null ? "Коллекционный юзернейм принадлежит вашему аккаунту." : "Юзернейм добавлен без покупки."}</p>
            <div className={styles.row}>
              <Button variant="link" disabled={busy} onClick={() => runEdit(selected.username)}>Редактировать</Button>
              <Button variant="link" className={styles.dangerLink} disabled={busy} onClick={() => void remove(selected.username)}>Удалить</Button>
              {!selected.primary ? <Button variant="secondary" disabled={busy} onClick={() => void change(() => setPrimaryUsername(selected.username))}>Сделать основным</Button> : null}
              {!selected.primary ? <Button variant="link" disabled={busy} onClick={() => void change(() => pinUsername(selected.username, !selected.pinned))}>{selected.pinned ? "Открепить" : "Закрепить"}</Button> : null}
            </div>
          </div>
        </Dialog>
      ) : null}
    </SettingsSection>
  );
}
