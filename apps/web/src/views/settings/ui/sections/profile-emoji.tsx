import { useState } from "react";

import { type SelfUser, useUpdateSelf } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, EmojiAvatarPicker, SettingsSection, toast } from "@/shared/ui";

import { updateProfile } from "../../api/settings-api";

import profileStyles from "./profile-section.module.css";
import styles from "./sections.module.css";

/**
 * Смайл вместо аватарки (как эмодзи-аватарки в Telegram): сразу на сервер. Фото остаются в
 * галерее, но смайл показывается вместо них; новое фото смайл убирает (это делает сервер).
 */
export function ProfileEmojiAvatar({ me }: { me: SelfUser }) {
  const updateSelf = useUpdateSelf();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (avatarEmoji: string | null) => {
    setBusy(true);
    try {
      const user = await updateProfile(me.id, { avatarEmoji });
      updateSelf({ avatarEmoji: user.avatarEmoji });
      setOpen(false);
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить смайл"), { error: true });
    }
    setBusy(false);
  };

  return (
    <SettingsSection title="Смайл на аватарке" caption="Анимированный смайл или стикер из ваших паков вместо фото профиля — его видят все, кому видно ваше фото.">
      <div className={styles.inline}>
        <Avatar name={me.name || "?"} color={me.avatarColor} emoji={me.avatarEmoji} size={48} />
        <div className={styles.grow}>
          <p className={profileStyles.rowTitle}>{me.avatarEmoji ? (me.avatarEmoji.startsWith("sticker:") ? "Стикер выбран" : "Смайл выбран") : "Без смайла"}</p>
        </div>
        <Button variant="secondary" className={profileStyles.actionButton} disabled={busy} onClick={() => setOpen((v) => !v)}>
          {me.avatarEmoji ? "Сменить смайл" : "Выбрать смайл"}
        </Button>
        {me.avatarEmoji ? (
          <Button variant="secondary" className={profileStyles.actionButton} disabled={busy} onClick={() => void save(null)}>
            Убрать смайл
          </Button>
        ) : null}
      </div>
      {open ? <EmojiAvatarPicker withStickers onPick={(e) => void save(e)} /> : null}
    </SettingsSection>
  );
}
