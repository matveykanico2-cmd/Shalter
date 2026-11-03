import { useRef, useState } from "react";

import { uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, Dialog, EmojiAvatarPicker, Icon, TextField, toast } from "@/shared/ui";

import { profileApi } from "../api/profile-api";

import styles from "./user-profile.module.css";

type Props = {
  user: {
    id: string;
    name: string;
    profileName?: string;
    avatarColor?: string | null;
    avatarImage?: string | null;
    avatarEmoji?: string | null;
    profileAvatarImage?: string | null;
    profileAvatarEmoji?: string | null;
  };
  contactName: string | null;
  note: string | null;
  /** Своё фото контакта — ссылка на файл, или смайл как «emoji:😀» (так его хранит сервер). */
  photo: string | null;
  /** Открыть личный чат (создать, если нет) — для «Предложить фото». */
  openDm: () => Promise<string>;
  onSaved: (next: { contactName: string | null; note: string | null; photo: string | null }) => void;
  onClose: () => void;
};

/** Имя из одной строки — «Имя Фамилия», как в Telegram. */
function splitName(name: string): [string, string] {
  const i = name.indexOf(" ");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 1)];
}

const EMOJI_PREFIX = "emoji:";

/**
 * «Изменить контакт», как в Telegram: имя и фамилия для себя, заметка, своё фото или
 * анимированный смайл (видите только вы) и «Предложить фото» — фото уходит человеку в личку.
 */
export function EditContactDialog({ user, contactName, note, photo, openDm, onSaved, onClose }: Props) {
  const [initialFirst, initialLast] = splitName(contactName ?? user.profileName ?? user.name);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [text, setText] = useState(note ?? "");
  const [localPhoto, setLocalPhoto] = useState(photo);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const setInput = useRef<HTMLInputElement>(null);
  const suggestInput = useRef<HTMLInputElement>(null);
  const firstName = first.trim() || user.name;
  const localEmoji = localPhoto?.startsWith(EMOJI_PREFIX) ? localPhoto.slice(EMOJI_PREFIX.length) : null;
  // Аватарка из профиля: сервер уже подставил своё фото или смайл, исходные — в profileAvatar*.
  const photoIsImage = !!photo && !photo.startsWith(EMOJI_PREFIX);
  const profileImage = (photoIsImage ? user.profileAvatarImage : user.avatarImage) ?? null;
  const profileEmoji = (photo ? user.profileAvatarEmoji : user.avatarEmoji) ?? null;
  const shownImage = localPhoto ? (localEmoji ? null : localPhoto) : profileImage;
  const shownEmoji = localPhoto ? localEmoji : profileEmoji;

  const save = async () => {
    setBusy(true);
    try {
      const name = [first.trim(), last.trim()].filter(Boolean).join(" ");
      await profileApi.renameContact(user.id, name);
      const res = await profileApi.setNote(user.id, text);
      if (localPhoto !== photo) await profileApi.setContactPhoto(user.id, localEmoji ? { emoji: localEmoji } : { url: localPhoto ?? "" });
      onSaved({ contactName: name || null, note: res.note ?? null, photo: localPhoto });
      onClose();
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить контакт"), { error: true });
      setBusy(false);
    }
  };

  const pickLocal = async (file: File | undefined) => {
    if (!file) return;
    // Пока фото грузится, смайл не выбрать: иначе загрузка молча перезапишет выбранный смайл.
    setEmojiOpen(false);
    setBusy(true);
    try {
      setLocalPhoto((await uploadFile(file, "image")).url);
    } catch (err) {
      toast(errorText(err, "Не удалось загрузить фото"), { error: true });
    }
    setBusy(false);
  };

  const suggest = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const [image, chatId] = await Promise.all([uploadFile(file, "image"), openDm()]);
      await profileApi.suggestPhoto(chatId, image);
      toast(`Фото предложено ${user.name}`);
    } catch (err) {
      toast(errorText(err, "Не удалось предложить фото"), { error: true });
    }
    setBusy(false);
  };

  return (
    <Dialog title="Изменить контакт" onClose={onClose} className={styles.editContact}>
      <div className={styles.editContactHead}>
        <Avatar size={72} name={firstName} color={user.avatarColor} image={shownImage} emoji={shownImage ? null : shownEmoji} />
      </div>
      <label className={styles.editContactField}>
        <span>Имя</span>
        <TextField value={first} maxLength={80} onChange={(e) => setFirst(e.target.value)} placeholder={user.profileName ?? user.name} />
      </label>
      <label className={styles.editContactField}>
        <span>Фамилия</span>
        <TextField value={last} maxLength={80} onChange={(e) => setLast(e.target.value)} />
      </label>
      <label className={styles.editContactField}>
        <span>Заметка · видите только вы</span>
        <textarea className={styles.editContactNote} value={text} maxLength={1000} rows={3} onChange={(e) => setText(e.target.value)} />
      </label>

      <input ref={setInput} type="file" accept="image/*" hidden onChange={(e) => void pickLocal(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      <input ref={suggestInput} type="file" accept="image/*" hidden onChange={(e) => void suggest(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      <button type="button" className={styles.actionButton} disabled={busy} onClick={() => setInput.current?.click()}>
        <Icon name="Camera" size={22} />
        Установить фото для {firstName}
      </button>
      <button type="button" className={styles.actionButton} disabled={busy} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
        <Icon name="Smile" size={22} />
        Установить смайл для {firstName}
      </button>
      {emojiOpen && !busy ? (
        <EmojiAvatarPicker
          withStickers
          onPick={(e) => {
            setLocalPhoto(EMOJI_PREFIX + e);
            setEmojiOpen(false);
          }}
        />
      ) : null}
      {localPhoto ? (
        <button type="button" className={`${styles.actionButton} ${styles.danger}`} disabled={busy} onClick={() => setLocalPhoto(null)}>
          <Icon name="Trash" size={22} />
          {localEmoji ? "Убрать свой смайл" : "Убрать своё фото"}
        </button>
      ) : null}
      <button type="button" className={styles.actionButton} disabled={busy} onClick={() => suggestInput.current?.click()}>
        <Icon name="Image" size={22} />
        Предложить фото для {firstName}
      </button>
      <p className={styles.hint}>Своё фото, смайл и имя видите только вы. Предложенное фото придёт {user.name} сообщением.</p>

      <div className={styles.editContactButtons}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}
