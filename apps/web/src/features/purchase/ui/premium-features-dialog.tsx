import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/shared/ui";

import type { PremiumPerk } from "../lib/premium-plans";

import styles from "./purchase.module.css";

type Props = { features: readonly PremiumPerk[]; start: number; isPremium: boolean; onSubscribe: () => void; onClose: () => void };

/**
 * Карусель возможностей Premium как в tweb (premiumFeatures.js): крупная иконка на градиенте,
 * название, описание, точки, стрелки и свайп; внизу — «Подписаться» или «Понятно».
 */
export function PremiumFeaturesDialog({ features, start, isPremium, onSubscribe, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const go = (i: number) => setIndex(Math.max(0, Math.min(features.length - 1, i)));
  const startX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(features.length - 1, i + 1));
      else if (e.key === "Escape") onClose();
      else return;
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [features.length, onClose]);

  const f = features[index]!;
  return createPortal(
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.carousel} role="dialog" aria-modal="true" aria-label="Shalter Premium">
        <button type="button" className={styles.carouselClose} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
          <Icon name="X" size={22} />
        </button>
        <div
          className={styles.slide}
          onPointerDown={(e) => (startX.current = e.clientX)}
          onPointerUp={(e) => {
            if (startX.current == null) return;
            const dx = e.clientX - startX.current;
            startX.current = null;
            if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
          }}
        >
          <div className={styles.slideHero} style={{ "--pf-color": f.color } as CSSProperties}>
            <div className={styles.slidePhone}>
              <Icon name={f.icon} size={64} />
            </div>
          </div>
          <h2 className={styles.slideTitle}>{f.title}</h2>
          <p className={styles.slideDesc}>{f.desc}</p>
        </div>
        {index > 0 ? (
          <button type="button" className={`${styles.nav} ${styles.navPrev}`} title="Назад" aria-label="Назад" onClick={() => go(index - 1)}>
            <Icon name="ChevronLeft" size={24} />
          </button>
        ) : null}
        {index < features.length - 1 ? (
          <button type="button" className={`${styles.nav} ${styles.navNext}`} title="Дальше" aria-label="Дальше" onClick={() => go(index + 1)}>
            <Icon name="ChevronRight" size={24} />
          </button>
        ) : null}
        <div className={styles.dots}>
          {features.map((x, i) => (
            <button key={x.title} type="button" className={i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot} title={x.title} aria-label={x.title} onClick={() => go(i)} />
          ))}
        </div>
        <div className={styles.carouselFooter}>
          {isPremium ? (
            <button type="button" className={styles.premiumButton} onClick={onClose}>
              Понятно
            </button>
          ) : (
            <button
              type="button"
              className={styles.premiumButton}
              onClick={() => {
                onClose();
                onSubscribe();
              }}
            >
              Подписаться на Shalter Premium
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
