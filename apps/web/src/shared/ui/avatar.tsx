import { useState } from "react";

import { hasAnimatedEmoji,renderAnimatedEmoji } from "../lib/anim";

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

/** Аватар: фото, анимация эмодзи (как в Telegram), или инициалы на цвете профиля. */
export function Avatar({ name, color, image, emoji, sticker = false, size = 44, online = false }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = !!image && !sticker && broken !== image;
  const showSticker = !!image && sticker && broken !== image;
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {showImage ? (
        <img className={styles.image} src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(image)} />
      ) : showSticker ? (
        <span className={styles.stickerWrap} style={{ background: color ?? undefined }}>
          <img className={styles.sticker} src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(image)} />
        </span>
      ) : emoji && hasAnimatedEmoji(emoji) ? (
        <DomNode key="animated" create={() => renderAnimatedEmoji(emoji, { size, replay: true })} />
      ) : (
        <span className={styles.fallback} translate="no" style={{ background: color ?? undefined, fontSize: size * 0.5 }}>
          {emoji ? emoji : initials(name) || "?"}
        </span>
      )}
      {online ? <span className={styles.online} style={{ width: size * 0.28, height: size * 0.28 }} /> : null}
    </span>
  );
}
