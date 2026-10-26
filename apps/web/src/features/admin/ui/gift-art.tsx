import { renderCustomScene } from "@/shared/lib/anim";
import { DomNode } from "@/shared/ui";

import styles from "./admin.module.css";

/**
 * Картинка подарка в админке: нарисованная сцена — анимацией, иначе эмодзи.
 * Встроенные сцены и Lottie (renderGiftArt, public/js/lib/giftTraits.js) — у витрины подарков.
 */
export function GiftArt({ gift, size = 40 }: { gift: { id?: string; emoji: string; scene?: unknown }; size?: number }) {
  return gift.scene ? (
    <DomNode key={JSON.stringify(gift.scene)} className={styles.giftArt} create={() => renderCustomScene(gift.scene, { size })} />
  ) : (
    <span className={styles.giftArt} aria-hidden>
      {gift.emoji}
    </span>
  );
}
