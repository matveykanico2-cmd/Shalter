import { GESTURES } from "../lib/gestures";
import type { ShownGesture } from "../model/use-call-gestures";

import styles from "./call-gestures.module.css";

/** Распознанный жест — большое эмодзи и подпись посреди экрана звонка. */
export function GestureEffect({ shown }: { shown: ShownGesture | null }) {
  const g = shown ? GESTURES[shown.gesture] : null;
  return (
    <div className={styles.layer} aria-live="polite">
      {g ? (
        <div key={shown!.key} className={styles.effect}>
          <span className={styles.emoji} aria-hidden="true">
            {g.emoji}
          </span>
          <span className={styles.label}>{g.label}</span>
        </div>
      ) : null}
    </div>
  );
}
