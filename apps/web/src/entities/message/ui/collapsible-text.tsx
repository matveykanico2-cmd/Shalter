// Очень длинный текст в пузыре — свёрнут до нескольких экранов строк с кнопкой
// «Показать полностью». Сворачивание только визуальное: весь текст остаётся в разметке,
// поэтому «Копировать», выделение и поиск по странице берут его целиком.
import { type ReactNode, useState } from "react";

import styles from "./collapsible-text.module.css";

export function CollapsibleText({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.wrap}>
      <div className={open ? styles.body : `${styles.body} ${styles.collapsed}`}>{children}</div>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {open ? "Свернуть" : "Показать полностью"}
      </button>
    </div>
  );
}
