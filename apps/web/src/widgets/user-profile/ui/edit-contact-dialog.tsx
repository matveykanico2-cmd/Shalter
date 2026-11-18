import { useRef, useState } from "react";

import { uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Avatar, AVATAR_VIDEO_PREFIX, AvatarBackgroundPicker, Button, Dialog, EmojiAvatarPicker, Icon, TextField, toast } from "@/shared/ui";

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
  avatars?: string[];
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
const VIDEO_PREFIX = AVATAR_VIDEO_PREFIX;
const isVideo = (value: string | null | undefined) => !!value?.startsWith(VIDEO_PREFIX);
const mediaUrl = (value: string) => (isVideo(value) ? value.slice(VIDEO_PREFIX.length) : value);

/**
 * «Изменить контакт», как в Telegram: имя и фамилия для себя, заметка, своё фото или
 * анимированный смайл (видите только вы) и «Предложить фото» — фото уходит человеку в личку.
 */
export function EditContactDialog({ user, contactName, note, photo, avatars, openDm, onSaved, onClose }: Props) {
  const [initialFirst, initialLast] = splitName(contactName ?? user.profileName ?? user.name);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [text, setText] = useState(note ?? "");
  const [localPhoto, setLocalPhoto] = useState(photo);
  const [localAvatars, setLocalAvatars] = useState<string[]>(() => avatars?.length ? avatars : photo ? [photo] : []);
  const [localColor, setLocalColor] = useState(user.avatarColor ?? "#2E56D9");
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const setInput = useRef<HTMLInputElement>(null);
  const suggestInput = useRef<HTMLInputElement>(null);
  const firstName = first.trim() || user.name;
  const localEmoji = localPhoto?.startsWith(EMOJI_PREFIX) ? localPhoto.slice(EMOJI_PREFIX.length) : null;
  // Аватарка из профиля: сервер уже подставил своё фото или смайл, исходные — в profileAvatar*.
  const photoIsImage = !!photo && !photo.startsWith(EMOJI_PREFIX) && !isVideo(photo);
  const profileImage = (photoIsImage ? user.profileAvatarImage : user.avatarImage) ?? null;
  const profileEmoji = (photo ? user.profileAvatarEmoji : user.avatarEmoji) ?? null;
  const shownVideo = localPhoto ? (isVideo(localPhoto) ? mediaUrl(localPhoto) : null) : profileImage && isVideo(profileImage) ? mediaUrl(profileImage) : null;
  const shownImage = localPhoto ? (localEmoji || shownVideo ? null : localPhoto) : profileImage && !isVideo(profileImage) ? profileImage : null;
  const shownEmoji = localPhoto ? localEmoji : profileEmoji;

  const save = async () => {
    setBusy(true);
    try {
      const name = [first.trim(), last.trim()].filter(Boolean).join(" ");
      await profileApi.renameContact(user.id, name);
      const res = await profileApi.setNote(user.id, text);
      if (localPhoto !== photo || localAvatars.length !== (avatars?.length ?? (photo ? 1 : 0)) || localColor !== (user.avatarColor ?? "#2E56D9")) {
        const ordered = localPhoto ? [localPhoto, ...localAvatars.filter((value) => value !== localPhoto)] : [];
        const gallery = ordered.length > 1 ? { avatars: ordered } : {};
        const color = localColor !== (user.avatarColor ?? "#2E56D9") ? { avatarColor: localColor } : {};
        await profileApi.setContactPhoto(user.id, localEmoji ? { emoji: localEmoji, ...color, ...gallery } : { url: localPhoto ?? "", ...color, ...gallery });
      }
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
      const video = file.type.startsWith("video/");
      const url = (await uploadFile(file, video ? "avatar-video" : "avatar")).url;
      const value = video ? VIDEO_PREFIX + url : url;
      setLocalAvatars((all) => [...all, value]);
      setLocalPhoto(value);
    } catch (err) {
      toast(errorText(err, "Не удалось загрузить фото"), { error: true });
    }
    setBusy(false);
  };

  const suggest = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const kind = file.type.startsWith("video/") ? "avatar-video" : "avatar";
      const [image, chatId] = await Promise.all([uploadFile(file, kind), openDm()]);
      await profileApi.suggestPhoto(chatId, image);
      toast(`Медиа предложено ${user.name}`);
    } catch (err) {
      toast(errorText(err, "Не удалось предложить фото"), { error: true });
    }
    setBusy(false);
  };

  return (
    <Dialog title="Изменить контакт" onClose={onClose} className={styles.editContact}>
      <div className={styles.editContactHead}>
        {shownVideo ? <video key={shownVideo} className={styles.contactPreviewVideo} src={shownVideo} muted loop autoPlay playsInline /> : <Avatar key={`${shownImage ?? ""}:${shownEmoji ?? ""}`} size={72} name={firstName} color={localColor} image={shownImage} emoji={shownImage ? null : shownEmoji} />}
      </div>
      <AvatarBackgroundPicker color={localColor} onPick={setLocalColor} />
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

      <input ref={setInput} type="file" accept="image/*,video/*" hidden onChange={(e) => void pickLocal(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      <input ref={suggestInput} type="file" accept="image/*,video/*" hidden onChange={(e) => void suggest(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      <button type="button" className={styles.actionButton} disabled={busy} onClick={() => setInput.current?.click()}>
        <Icon name="Camera" size={22} />
        Установить фото, видео или GIF для {firstName}
      </button>
      <button type="button" className={styles.actionButton} disabled={busy} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
        <Icon name="Smile" size={22} />
        Установить смайл для {firstName}
      </button>
      {emojiOpen && !busy ? (
        <EmojiAvatarPicker
          withStickers
          multi
          onPick={(e) => {
            const value = EMOJI_PREFIX + e;
            setLocalAvatars((all) => [...all, value]);
            setLocalPhoto(value);
            setEmojiOpen(false);
          }}
        />
      ) : null}
      {localAvatars.length ? (
        <div className={styles.contactAvatarGallery} aria-label="Аватары контакта">
          {localAvatars.map((value, index) => {
            const emoji = value.startsWith(EMOJI_PREFIX) ? value.slice(EMOJI_PREFIX.length) : null;
            return (
              <div
                className={localPhoto === value ? `${styles.contactAvatarItem} ${styles.contactAvatarSelected}` : styles.contactAvatarItem}
                key={`${value}-${index}`}
              >
                <button type="button" className={styles.contactAvatarPick} aria-label={`Выбрать аватар ${index + 1}`} aria-pressed={localPhoto === value} onClick={() => setLocalPhoto(value)}>
                  {isVideo(value) ? <video key={value} className={styles.contactAvatarVideo} src={mediaUrl(value)} muted loop autoPlay playsInline /> : <Avatar key={value} size={48} name={firstName} color={localColor} image={emoji ? null : value} emoji={emoji} />}
                </button>
                <button type="button" className={styles.contactAvatarRemove} aria-label={`Убрать аватар ${index + 1}`} onClick={() => {
                  const next = localAvatars.filter((_, i) => i !== index);
                  setLocalAvatars(next);
                  if (localPhoto === value) setLocalPhoto(next[0] ?? null);
                }}><Icon name="X" size={12} /></button>
              </div>
            );
          })}
        </div>
      ) : null}
      {localPhoto ? (
        <button type="button" className={`${styles.actionButton} ${styles.danger}`} disabled={busy} onClick={() => { setLocalPhoto(null); setLocalAvatars([]); }}>
          <Icon name="Trash" size={22} />
          {localEmoji ? "Убрать свой смайл" : isVideo(localPhoto) ? "Убрать своё видео" : "Убрать своё фото"}
        </button>
      ) : null}
      <button type="button" className={styles.actionButton} disabled={busy} onClick={() => suggestInput.current?.click()}>
        <Icon name="Image" size={22} />
        Предложить фото или видео для {firstName}
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
