import type { ReactNode } from "react";

import { Icon } from "@/shared/ui";

import styles from "./auth-frame.module.css";

type Props = {
  title?: string;
  subtitle?: string;
  /** «Назад» в углу (добавление аккаунта): вернуться в приложение. */
  onBack?: () => void;
  children: ReactNode;
};

/** Страница вне приложения — вход, подтверждение QR, OAuth: фон с пятнами, знак и карточка (.login-page). */
export function AuthFrame({ title = "Shalter", subtitle, onBack, children }: Props) {
  return (
    <div className={styles.page}>
      {onBack && (
        // Как в Telegram: «назад» в углу вместо длинной ссылки внизу карточки.
        <button type="button" className={styles.back} title="Отмена" aria-label="Отмена — вернуться в приложение" onClick={onBack}>
          <Icon name="ChevronLeft" size={22} />
        </button>
      )}
      <div className={styles.bg} aria-hidden="true">
        <span className={`${styles.orb} ${styles.orb1}`} />
        <span className={`${styles.orb} ${styles.orb2}`} />
        <span className={`${styles.orb} ${styles.orb3}`} />
      </div>
      <div className={styles.box}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <img src="/icons/icon.svg" alt="Shalter" draggable={false} />
          </div>
          <h1 className={styles.brand}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
}
