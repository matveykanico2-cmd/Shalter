import { type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

import styles from "./dialog.module.css";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

/** Модальное окно по центру — как .modal-overlay/.modal-dialog в public/styles. */
export function Dialog({ title, children, onClose, className }: Props) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={className ? `${styles.dialog} ${className}` : styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
