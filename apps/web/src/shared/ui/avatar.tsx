import { useState } from "react";

import styles from "./avatar.module.css";

type Props = {
  name: string;
  color?: string | null;
  image?: string | null;
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

/** Аватар: фото, а без него (или если не загрузилось) — инициалы на цвете профиля. */
export function Avatar({ name, color, image, size = 44, online = false }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = !!image && broken !== image;
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {showImage ? (
        <img className={styles.image} src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(image)} />
      ) : (
        <span className={styles.fallback} style={{ background: color ?? undefined, fontSize: size * 0.4 }}>
          {initials(name) || "?"}
        </span>
      )}
      {online ? <span className={styles.online} style={{ width: size * 0.28, height: size * 0.28 }} /> : null}
    </span>
  );
}
