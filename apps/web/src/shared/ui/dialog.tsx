import { type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

import styles from "./dialog.module.css";
import { Icon } from "./icon";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  className?: string;
  overlayClassName?: string;
};

/** Модальное окно по центру — как .modal-overlay/.modal-dialog в public/styles. */
export function Dialog({ title, children, onClose, onBack, className, overlayClassName }: Props) {
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
      className={overlayClassName ? `${styles.overlay} ${overlayClassName}` : styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={className ? `${styles.dialog} ${className}` : styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.header}>
          {onBack ? (
            <button type="button" className={styles.back} onClick={onBack} aria-label="Назад" title="Назад">
              <Icon name="ChevronLeft" size={22} />
            </button>
          ) : null}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
