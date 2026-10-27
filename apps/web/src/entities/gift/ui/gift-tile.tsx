import type { CSSProperties, ReactNode } from "react";

import { giftBackdrop } from "../lib/gift-background";
import { formatStars } from "../lib/gift-stars";
import type { GiftLike } from "../model/types";

import styles from "./gift.module.css";
import { GiftArt, GiftBackdrop } from "./gift-art";

type Props = {
  gift: GiftLike;
  /** Имя кнопки для чтения с экрана — название подарка. */
  label: string;
  title?: string;
  /** Уголок-лента: «лимит», «редкий», «распродан» или номер. */
  badge?: { text: string; tone?: "soldOut" | "rare"; style?: CSSProperties } | null;
  /** Значок слева сверху: отправитель или булавка. */
  corner?: ReactNode;
  /** Подпись под картинкой (выбор подарка админом). */
  name?: string;
  /** Цена в звёздах или «Бесплатно». */
  price: number | "free";
  backdrop?: Parameters<typeof giftBackdrop>[0];
  soldOut?: boolean;
  onClick: () => void;
};

/** Плитка подарка в сетке (tw-gift-item): витрина, выбор, полка в профиле. */
export function GiftTile({ gift, label, title, badge, corner, name, price, backdrop, soldOut, onClick }: Props) {
  const bd = giftBackdrop(backdrop ?? null);
  const cls = [styles.tile, bd ? styles.tileBackdrop : "", soldOut ? styles.soldOut : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} title={title} aria-label={label} style={bd ? ({ "--gift-overlay": bd.edge } as CSSProperties) : undefined} onClick={onClick}>
      {bd ? <GiftBackdrop src={bd} small /> : null}
      {badge ? (
        <span className={[styles.badge, badge.tone === "soldOut" ? styles.badgeSoldOut : badge.tone === "rare" ? styles.badgeRare : ""].filter(Boolean).join(" ")} style={badge.style}>
          <span className={styles.badgeText}>{badge.text}</span>
        </span>
      ) : null}
      {corner}
      <span className={styles.sticker}>
        <GiftArt gift={gift} size={72} replay={false} />
      </span>
      {name ? <span className={styles.tileName}>{name}</span> : null}
      {price === "free" ? (
        <span className={`${styles.price} ${styles.free}`}>Бесплатно</span>
      ) : (
        <span className={styles.price}>
          <span>⭐</span>
          {formatStars(price)}
        </span>
      )}
    </button>
  );
}

/** Сетка плиток (tw-gifts-grid). */
export function GiftGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
