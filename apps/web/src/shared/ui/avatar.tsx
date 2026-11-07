import { useState } from "react";

import { hasAnimatedEmoji, renderAnimatedEmoji } from "../lib/anim";

import styles from "./avatar.module.css";
import { DomNode } from "./dom-node";

type Props = {
  name: string;
  color?: string | null;
  image?: string | null;
  emoji?: string | null;
  /** Стикер-аватар: картинка вписывается в круг (object-fit: contain) на цветном фоне. */
  sticker?: boolean;
  size?: number;
  online?: boolean;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

/**
 * Аватар: смайл (анимированный, как эмодзи-аватарки в Telegram), стикер, фото или инициалы на
 * цвете профиля. Смайл выбран вместо фото, поэтому он важнее: у профиля фото остаются в галерее.
 */
/** Стикер из пака на аватарке хранится в поле смайла как «sticker:/uploads/…». */
export const AVATAR_STICKER_PREFIX = "sticker:";

export function Avatar({ name, color, image: photo, emoji: rawEmoji, sticker: stickerProp = false, size = 44, online = false }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const stickerUrl = rawEmoji?.startsWith(AVATAR_STICKER_PREFIX) ? rawEmoji.slice(AVATAR_STICKER_PREFIX.length) : null;
  const emoji = stickerUrl ? null : rawEmoji;
  const image = stickerUrl ?? photo;
  const sticker = stickerUrl ? true : stickerProp;
  const showImage = !emoji && !!image && !sticker && broken !== image;
  const showSticker = !emoji && !!image && sticker && broken !== image;
  const background = color ?? "var(--color-accent)";
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {emoji && hasAnimatedEmoji(emoji) ? (
        <span className={styles.emojiAvatar} style={{ background }}>
          <DomNode key={`animated:${emoji}`} create={() => renderAnimatedEmoji(emoji, { size: size * 0.82, replay: true })} />
        </span>
      ) : showImage ? (
        <img className={styles.image} src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(image)} />
      ) : showSticker ? (
        <span className={styles.stickerWrap} style={{ background }}>
          <img className={styles.sticker} src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(image)} />
        </span>
      ) : (
        <span className={styles.fallback} translate="no" style={{ background, fontSize: size * 0.5 }}>
          {emoji ? <span className={styles.emojiBg}>{emoji}</span> : initials(name) || "?"}
        </span>
      )}
      {online ? <span className={styles.online} style={{ width: size * 0.28, height: size * 0.28 }} /> : null}
    </span>
  );
}
