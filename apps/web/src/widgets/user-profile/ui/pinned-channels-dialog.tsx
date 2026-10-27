import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { Avatar, Button, Dialog } from "@/shared/ui";

import { type ChannelCard, pinnedChannelsApi, profileQueries } from "../api/profile-api";

import styles from "./user-profile.module.css";

type Props = { pinned: readonly ChannelCard[]; onSaved: (next: ChannelCard[]) => void; onClose: () => void };

/** «Каналы в профиле» — как public/js/components/pinnedChannelsDialog.js. */
export function PinnedChannelsDialog({ pinned, onSaved, onClose }: Props) {
  const list = useQuery({ queryKey: [...profileQueries.baseKey, "pinnable"], queryFn: pinnedChannelsApi.pinnable, staleTime: 0 });
  const [chosen, setChosen] = useState(() => pinned.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const channels = list.data?.channels ?? [];
  const max = list.data?.max ?? 6;
  // Каналы, которых больше нет среди своих, из выбора выпадают.
  const shown = list.data ? chosen.filter((id) => channels.some((c) => c.id === id)) : chosen;

  const toggle = (id: string) => {
    if (shown.includes(id)) setChosen(shown.filter((x) => x !== id));
    else if (shown.length < max) setChosen([...shown, id]);
    else setError(`Больше ${max} каналов в профиль не поместится`);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { pinnedChannels } = await pinnedChannelsApi.save(shown);
      onSaved(pinnedChannels);
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
      setSaving(false);
    }
  };

  const loadError = list.isError ? errorText(list.error, "Не удалось загрузить список каналов") : null;
  return (
    <Dialog title="Каналы в профиле" onClose={onClose} className={styles.pinnedDialog}>
      {list.data && !channels.length ? (
        <>
          <p className={styles.hint}>Здесь появятся ваши публичные каналы — те, где вы владелец или администратор.</p>
          <p className={styles.hint}>У закрытого канала сначала нужно включить публичную ссылку: посторонний всё равно не сможет по нему перейти.</p>
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.pinnedList}>
            {channels.map((c) => {
              const at = shown.indexOf(c.id);
              return (
                <button key={c.id} type="button" className={at >= 0 ? `${styles.pinnedRow} ${styles.pinnedOn}` : styles.pinnedRow} aria-pressed={at >= 0} onClick={() => toggle(c.id)}>
                  <Avatar size={36} name={c.title} color={c.avatarColor} image={c.avatarImage} />
                  <span className={styles.channelBody}>
                    <span className={styles.channelTitle}>{c.title}</span>
                    <span className={styles.channelSub}>{c.username ? `@${c.username}` : `${c.members} ${plural(c.members, "подписчик", "подписчика", "подписчиков")}`}</span>
                  </span>
                  <span className={styles.pinnedMark}>{at >= 0 ? at + 1 : ""}</span>
                </button>
              );
            })}
          </div>
          {error || loadError ? <p className={styles.error}>{error ?? loadError}</p> : null}
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button disabled={saving || !list.data} onClick={() => void save()}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
