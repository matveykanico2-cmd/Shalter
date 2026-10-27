import { type MouseEvent, type ReactNode, useRef, useState } from "react";

import styles from "./attachments.module.css";

const DOUBLE_TAP_MS = 200;

type Props = {
  className?: string;
  spoiler?: boolean;
  label: string;
  style?: React.CSSProperties;
  onOpen?: () => void;
  /** Двойное нажатие на медиа — реакции вместо просмотра (как в tweb). */
  onDoubleTap?: (at: { x: number; y: number }) => void;
  children: ReactNode;
};

/**
 * Фото или видео в пузыре — MediaButton из public/js/components/attachments.js: спойлер
 * снимается первым нажатием, следующее открывает просмотр; двойное — реакции.
 */
export function MediaTile({ className, spoiler = false, label, style, onOpen, onDoubleTap, children }: Props) {
  const [hidden, setHidden] = useState(spoiler);
  const lastClick = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (hidden) {
      setHidden(false);
      return;
    }
    const now = Date.now();
    if (onDoubleTap && now - lastClick.current < DOUBLE_TAP_MS) {
      clearTimeout(pending.current);
      lastClick.current = 0;
      onDoubleTap({ x: e.clientX, y: e.clientY });
      return;
    }
    lastClick.current = now;
    if (!onDoubleTap) onOpen?.();
    else pending.current = setTimeout(() => onOpen?.(), DOUBLE_TAP_MS);
  };

  return (
    <button type="button" className={[styles.tile, className, hidden ? styles.spoiler : ""].filter(Boolean).join(" ")} style={style} aria-label={label} onClick={onClick}>
      {children}
      {hidden ? (
        <span className={styles.spoilerCover} aria-hidden="true">
          <span className={styles.spoilerLabel}>Нажмите, чтобы открыть</span>
        </span>
      ) : null}
    </button>
  );
}
