import { useState } from "react";

import { type SelfUser, useUpdateSelf } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Button, Icon, SettingsSection, TextField } from "@/shared/ui";

import { updateProfile } from "../../api/settings-api";

import profileStyles from "./profile-section.module.css";
import styles from "./sections.module.css";

type Link = { title: string; target: string };

const MAX_LINKS = 3;
const MAX_TITLE = 32;

/** Кнопки в профиле (как в Telegram): до трёх, каждая ведёт на @ник или https-ссылку. */
export function ProfileLinksEditor({ me }: { me: SelfUser }) {
  const updateSelf = useUpdateSelf();
  const [links, setLinks] = useState<Link[]>(() => (me.profileLinks ?? []).map((l) => ({ ...l })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const edit = (i: number, patch: Partial<Link>) => {
    setSaved(false);
    setLinks((list) => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const user = await updateProfile(me.id, { profileLinks: links.map((l) => ({ title: l.title.trim(), target: l.target.trim() })) });
      updateSelf({ profileLinks: user.profileLinks ?? [] });
      setLinks((user.profileLinks ?? []).map((l) => ({ ...l })));
      setSaved(true);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить кнопки"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Кнопки в профиле">
      <p className={styles.hint}>До {MAX_LINKS} кнопок под описанием профиля: на @ник или на сайт (https://…).</p>
      {links.map((link, i) => (
        <div key={i} className={styles.inline}>
          <div className={profileStyles.linkFields}>
            <TextField aria-label={`Название кнопки ${i + 1}`} placeholder="Название" value={link.title} maxLength={MAX_TITLE} onChange={(e) => edit(i, { title: e.target.value })} />
            <TextField aria-label={`Ссылка кнопки ${i + 1}`} placeholder="@username или https://…" value={link.target} maxLength={512} onChange={(e) => edit(i, { target: e.target.value })} />
          </div>
          <button
            type="button"
            className={styles.iconButton}
            title="Убрать кнопку"
            aria-label={`Убрать кнопку ${i + 1}`}
            disabled={busy}
            onClick={() => {
              setSaved(false);
              setLinks((list) => list.filter((_, j) => j !== i));
            }}
          >
            <Icon name="Trash" size={16} />
          </button>
        </div>
      ))}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          className={profileStyles.actionButton}
          disabled={busy || links.length >= MAX_LINKS}
          onClick={() => {
            setSaved(false);
            setLinks((list) => [...list, { title: "", target: "" }]);
          }}
        >
          Добавить кнопку
        </Button>
        <Button className={profileStyles.actionButton} disabled={busy} onClick={() => void save()}>
          {saved ? "Сохранено ✓" : "Сохранить кнопки"}
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </SettingsSection>
  );
}
