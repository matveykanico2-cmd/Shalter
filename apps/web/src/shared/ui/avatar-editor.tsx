import { useRef, useState } from "react";

import { errorText } from "../lib/error-text";
import { fileToImageDataUrl } from "../lib/image";

import { Avatar } from "./avatar";
import styles from "./avatar-editor.module.css";
import { EmojiAvatarPicker } from "./emoji-avatar-picker";
import { Icon } from "./icon";
import { toast } from "./toast-store";

/** Аватар группы, канала или сообщества: фото или смайл (стикер) — одно сменяет другое. */
export type AvatarValue = { image: string | null; emoji: string | null };

type Props = {
  name: string;
  image: string | null;
  emoji: string | null;
  color?: string | null;
  size?: number;
  /** Сторона уменьшенного фото: у профиля сервер принимает картинку до 400 КБ — там меньше. */
  photoSize?: number;
  onChange: (value: AvatarValue) => void;
};

/**
 * Выбор аватара как в профиле: нажатие на круг — фото с устройства, «Смайл или стикер» —
 * анимированный смайл или стикер из своих паков («sticker:/uploads/…») вместо фото.
 */
export function AvatarEditor({ name, image, emoji, color, size = 96, photoSize = 512, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange({ image: await fileToImageDataUrl(file, photoSize), emoji: null });
      setEmojiOpen(false);
    } catch (err) {
      toast(errorText(err, "Не удалось прочитать изображение"), { error: true });
    }
  };
  return (
    <div className={styles.editor}>
      <button type="button" className={styles.photo} title="Выбрать фото" onClick={() => input.current?.click()}>
        <Avatar size={size} name={name || "?"} color={color} image={image} emoji={emoji} />
        <span className={styles.photoIcon}>
          <Icon name="Camera" size={16} />
        </span>
      </button>
      <div className={styles.actions}>
        <button type="button" className={styles.action} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
          <Icon name="Smile" size={16} /> Смайл или стикер
        </button>
        {image || emoji ? (
          <button
            type="button"
            className={styles.action}
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
          withStickers
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
    </div>
  );
}
