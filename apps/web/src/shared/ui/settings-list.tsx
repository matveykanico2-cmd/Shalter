import type { ReactNode } from "react";
import { Link } from "react-router";

import { Icon, type IconName } from "./icon";
import styles from "./settings-list.module.css";
import { Toggle } from "./toggle";

// Цвета иконок строк — TW_ROW_COLORS в public/js/views/settings/index.js (ROW_ICON_COLORS из tweb).
const ROW_COLORS = {
  blue: "#2196F3",
  green: "#4CAF50",
  grey: "#78909C",
  orange: "#FB8C00",
  pink: "#E91E63",
  purple: "#7E57C2",
  red: "#F44336",
} as const;

export type SettingsRowColor = keyof typeof ROW_COLORS | "premium";

/** Страница раздела настроек (pageWrap): подзаголовок и секции; title — для разделов вне шапки настроек. */
export function SettingsPage({ title, subtitle, children }: { title?: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.page}>
      {title ? <h2 className={styles.pageTitle}>{title}</h2> : null}
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      {children}
    </div>
  );
}

/** Белая карточка со строками (twSection): название сверху, пояснение снизу, справа от названия — действие. */
export function SettingsSection({ title, titleRight, caption, children }: { title?: ReactNode; titleRight?: ReactNode; caption?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.group}>
      {title ? (
        <p className={styles.name}>
          <span>{title}</span>
          {titleRight}
        </p>
      ) : null}
      <div className={styles.section}>{children}</div>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
    </div>
  );
}

type RowProps = {
  icon?: IconName;
  /** С цветом — белая иконка на цветной плашке, как в главном меню настроек. */
  color?: SettingsRowColor;
  title: ReactNode;
  /** Значение справа от заголовка (число сеансов, баланс). */
  titleRight?: ReactNode;
  /** Строка между заголовком и подзаголовком обычным цветом (система у сеанса). */
  midtitle?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  danger?: boolean;
  accent?: boolean;
  disabled?: boolean;
  /** Переключатель справа: вся строка — кнопка, нажатие переключает. */
  toggle?: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean };
  /** Подсказка при наведении и доступное имя, если заголовок не текст. */
  label?: string;
} & ({ href: string; external?: boolean; onClick?: never } | { onClick?: () => void; href?: never; external?: never });

/** Строка настроек (twRow): href — ссылка роутера (role link), onClick — кнопка, без них — просто строка. */
export function SettingsRow(props: RowProps) {
  const { icon, color, title, titleRight, midtitle, subtitle, right, danger, accent, disabled, toggle, label } = props;
  const cls = [styles.row, danger && styles.danger, accent && styles.accent].filter(Boolean).join(" ");
  const media = icon ? (
    color ? (
      <span className={styles.media} style={color === "premium" ? { backgroundImage: "var(--tw-premium-gradient, linear-gradient(88deg, #6c93ff, #976fff, #df69d1))" } : { backgroundColor: ROW_COLORS[color] }}>
        <Icon name={icon} size={20} />
      </span>
    ) : (
      <span className={styles.icon}>
        <Icon name={icon} size={24} />
      </span>
    )
  ) : null;
  const body = (
    <>
      {media}
      <span className={styles.body}>
        <span className={styles.title}>
          <span className={styles.titleText}>{title}</span>
          {titleRight != null && titleRight !== "" ? <span className={styles.titleRight}>{titleRight}</span> : null}
        </span>
        {midtitle ? <span className={styles.midtitle}>{midtitle}</span> : null}
        {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
      </span>
      {toggle ? (
        <span className={styles.right}>
          <Toggle checked={toggle.checked} />
        </span>
      ) : right != null ? (
        <span className={styles.right}>{right}</span>
      ) : null}
    </>
  );
  if (toggle) {
    // Кнопка (как в старом клиенте), а состояние — aria-pressed.
    return (
      <button
        type="button"
        className={`${cls} ${styles.clickable}`}
        aria-pressed={toggle.checked}
        aria-label={label}
        disabled={toggle.disabled || disabled}
        onClick={() => toggle.onChange(!toggle.checked)}
      >
        {body}
      </button>
    );
  }
  if (props.href != null) {
    return props.external ? (
      <a className={`${cls} ${styles.clickable}`} href={props.href} aria-label={label}>
        {body}
      </a>
    ) : (
      <Link className={`${cls} ${styles.clickable}`} to={props.href} aria-label={label}>
        {body}
      </Link>
    );
  }
  if (props.onClick) {
    return (
      <button type="button" className={`${cls} ${styles.clickable}`} aria-label={label} title={label} disabled={disabled} onClick={props.onClick}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Строка-кнопка без заголовка-подписи, синяя или красная (twButton). */
export function SettingsButton({ icon, children, onClick, danger, disabled }: { icon?: IconName; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={danger ? `${styles.button} ${styles.buttonDanger}` : styles.button} disabled={disabled} onClick={onClick}>
      {icon ? (
        <span className={styles.buttonIcon}>
          <Icon name={icon} size={24} />
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}
