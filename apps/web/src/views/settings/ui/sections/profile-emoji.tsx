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

  const save = async (patch: { avatarEmoji?: string | null; avatarColor?: string }, close = false) => {
    setBusy(true);
    try {
      const user = await updateProfile(me.id, patch);
      updateSelf({
        ...(Object.hasOwn(patch, "avatarEmoji") ? { avatarEmoji: user.avatarEmoji } : {}),
        ...(Object.hasOwn(patch, "avatarColor") ? { avatarColor: user.avatarColor } : {}),
      });
      if (close) setOpen(false);
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить аватар"), { error: true });
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
          <Button variant="secondary" className={profileStyles.actionButton} disabled={busy} onClick={() => void save({ avatarEmoji: null }, true)}>
            Убрать смайл
          </Button>
        ) : null}
      </div>
      {open ? (
        <EmojiAvatarPicker
          withStickers
          color={me.avatarColor}
          onColor={(avatarColor) => void save({ avatarColor: avatarColor ?? "transparent" })}
          onPick={(avatarEmoji) => void save({ avatarEmoji }, true)}
        />
      ) : null}
    </SettingsSection>
  );
}
