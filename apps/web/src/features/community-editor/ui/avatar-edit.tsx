import { useRef, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { Avatar, EmojiAvatarPicker, Icon, toast } from "@/shared/ui";

import styles from "./community-editor.module.css";

/** Аватар сообщества: фото или смайл — одно сменяет другое. */
export type AvatarValue = { image: string | null; emoji: string | null };

type Props = { name: string; image: string | null; emoji: string | null; onChange: (value: AvatarValue) => void };

/** Фото сообщества с выбором файла (twAvatarEdit в twTab.js) или смайл вместо него. */
export function AvatarEdit({ name, image, emoji, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange({ image: await fileToImageDataUrl(file, 512), emoji: null });
      setEmojiOpen(false);
    } catch (err) {
      toast(errorText(err, "Не удалось прочитать изображение"), { error: true });
    }
  };
  return (
    <>
      <button type="button" className={styles.avatarEdit} title="Выбрать фото" onClick={() => input.current?.click()}>
        <Avatar size={96} name={name || "?"} image={image} emoji={emoji} />
        <span className={styles.avatarIcon}>
          <Icon name="Camera" size={30} />
        </span>
      </button>
      <div className={styles.avatarActions}>
        <button type="button" className={styles.avatarAction} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
          <Icon name="Smile" size={16} /> Смайл
        </button>
        {image || emoji ? (
          <button
            type="button"
            className={styles.avatarAction}
            onClick={() => {
              onChange({ image: null, emoji: null });
              setEmojiOpen(false);
            }}
          >
            <Icon name="X" size={16} /> {emoji ? "Убрать смайл" : "Убрать фото"}
          </button>
        ) : null}
      </div>
      {emojiOpen ? (
        <EmojiAvatarPicker
          onPick={(e) => {
            onChange({ image: null, emoji: e });
            setEmojiOpen(false);
          }}
        />
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Фото"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
