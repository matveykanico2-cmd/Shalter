import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = dialogRef.current?.querySelector<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])");
    (first ?? dialogRef.current)?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const trapFocus = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={overlayClassName ? `${styles.overlay} ${overlayClassName}` : styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} onKeyDown={trapFocus} className={className ? `${styles.dialog} ${className}` : styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
