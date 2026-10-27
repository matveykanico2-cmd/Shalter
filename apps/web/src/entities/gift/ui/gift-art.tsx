import type { CSSProperties } from "react";

import { DomNode } from "@/shared/ui";

import { giftBackdrop } from "../lib/gift-background";
import { type GiftArtOptions, renderGiftArt } from "../lib/gift-traits";
import type { GiftLike } from "../model/types";

import styles from "./gift.module.css";

/** Ключ картинки: другой подарок — новая картинка, перерисовка ленты анимацию не перезапускает. */
const artKey = (g: GiftLike) => `${g.giftId ?? g.id ?? ""}|${g.emoji ?? ""}|${g.mediaUrl ?? ""}|${g.scene ? JSON.stringify(g.scene).length : 0}`;

/** Картинка подарка (renderGiftArt в public/js/lib/giftTraits.js): сцена, анимация или эмодзи. */
export function GiftArt({ gift, size = 84, replay = true, className }: { gift: GiftLike; className?: string } & GiftArtOptions) {
  return <DomNode key={`${artKey(gift)}|${size}`} className={className ?? styles.art} create={() => renderGiftArt(gift, { size, replay })} />;
}

type BackdropSrc = Parameters<typeof giftBackdrop>[0];

/** Фон подарка (renderGiftBackdrop): край, свечение, узор символом. */
export function GiftBackdrop({ src, small = false, className }: { src: BackdropSrc; small?: boolean; className?: string }) {
  const bd = giftBackdrop(src);
  if (!bd) return null;
  const vars = { "--gift-backdrop-edge": bd.edge, "--gift-backdrop-center": bd.center, "--gift-backdrop-pattern": bd.pattern } as CSSProperties;
  return (
    <div className={[styles.backdrop, small ? styles.backdropSmall : "", className ?? ""].filter(Boolean).join(" ")} style={vars}>
      <div className={styles.halo} />
      {bd.symbol ? <div className={styles.pattern} style={{ "--gift-symbol": `url("${bd.symbol.image}")` } as CSSProperties} /> : null}
    </div>
  );
}
