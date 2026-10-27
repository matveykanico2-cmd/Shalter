import type { ReactNode } from "react";

import { copyText } from "../lib/clipboard";

import { Icon, type IconName } from "./icon";
import styles from "./info-row.module.css";

type Props = {
  icon: IconName;
  value: ReactNode;
  label: string;
  accent?: boolean;
  multiline?: boolean;
  /** Нажатие копирует это значение. */
  copy?: string;
  onClick?: () => void;
};

/** Строка профиля «значение / подпись» — как infoRow в public/js/components/profileDialog.js. */
export function InfoRow({ icon, value, label, accent, multiline, copy, onClick }: Props) {
  const action = onClick ?? (copy ? () => void copyText(copy, `${label}: скопировано`) : undefined);
  const valueClass = [styles.value, accent && styles.accent, multiline && styles.multiline].filter(Boolean).join(" ");
  const body = (
    <>
      <span className={styles.icon}>
        <Icon name={icon} size={24} />
      </span>
      <span className={styles.body}>
        <span className={valueClass}>{value}</span>
        <span className={styles.label}>{label}</span>
      </span>
    </>
  );
  return action ? (
    <button type="button" className={`${styles.row} ${styles.clickable}`} title={copy && !onClick ? "Нажмите, чтобы скопировать" : undefined} onClick={action}>
      {body}
    </button>
  ) : (
    <div className={styles.row}>{body}</div>
  );
}
