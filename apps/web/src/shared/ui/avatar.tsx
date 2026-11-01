import { useState } from "react";

import { hasAnimatedEmoji,renderAnimatedEmoji } from "../lib/anim";

import styles from "./avatar.module.css";
import { DomNode } from "./dom-node";

type Props = {
  name: string;
  color?: string | null;
  image?: string | null;
  emoji?: string | null;
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
 * Аватар: смайл (анимированный, как эмодзи-аватарки в Telegram), фото или инициалы на цвете
 * профиля. Смайл выбран вместо фото, поэтому он важнее: у профиля фото остаются в галерее.
 */
export function Avatar({ name, color, image, emoji, size = 44, online = false }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = !emoji && !!image && broken !== image;
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {emoji && hasAnimatedEmoji(emoji) ? (
        <DomNode key={`animated:${emoji}`} create={() => renderAnimatedEmoji(emoji, { size, replay: true })} />
      ) : showImage ? (
        <img className={styles.image} src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(image)} />
      ) : (
        <span className={styles.fallback} translate="no" style={{ background: color ?? undefined, fontSize: size * 0.5 }}>
          {emoji ? emoji : initials(name) || "?"}
        </span>
      )}
      {online ? <span className={styles.online} style={{ width: size * 0.28, height: size * 0.28 }} /> : null}
    </span>
  );
}
