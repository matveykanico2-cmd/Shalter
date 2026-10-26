import type { ReactNode } from "react";

import { Avatar, Icon, type IconName, Toggle } from "@/shared/ui";

import styles from "./edit-chat.module.css";

/** Раздел-карточка с заголовком и подписью снизу (tw-section-group). */
export function Section({ name, caption, children }: { name?: string; caption?: string; children: ReactNode }) {
  return (
    <section className={styles.group} aria-label={name}>
      {name ? <p className={styles.sectionName}>{name}</p> : null}
      <div className={styles.section}>{children}</div>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
    </section>
  );
}

const COLORS = { blue: "#2196F3", green: "#4CAF50", grey: "#78909C", orange: "#FB8C00", pink: "#E91E63", purple: "#7E57C2", red: "#F44336" };

/** Строка-раздел с цветной иконкой: открывает свою вкладку. */
export function NavRow({ icon, color, title, right, onClick }: { icon: IconName; color: keyof typeof COLORS; title: string; right?: string | null; onClick: () => void }) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.media} style={{ backgroundColor: COLORS[color] }}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>
          <span>{title}</span>
          {right ? <span className={styles.right}>{right}</span> : null}
        </span>
      </span>
    </button>
  );
}

export function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={styles.row} onClick={() => onChange(!checked)}>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      <Toggle checked={checked} />
    </button>
  );
}

export type RadioOption<T> = { value: T; label: string; sub?: string };

export function RadioRows<T>({ label, options, value, onPick }: { label: string; options: readonly RadioOption<T>[]; value: T; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={styles.row} onClick={() => onPick(o.value)}>
          <span className={o.value === value ? `${styles.radio} ${styles.radioOn}` : styles.radio} />
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>{o.label}</span>
            {o.sub ? <span className={styles.subtitle}>{o.sub}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

type Person = { id: string; name: string; username?: string | null; avatarColor?: string | null; avatarImage?: string | null };

export function PersonRow({ user, children }: { user: Person; children: ReactNode }) {
  return (
    <div className={styles.person}>
      <Avatar size={42} name={user.name} color={user.avatarColor} image={user.avatarImage} />
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{user.name}</span>
        {user.username ? <span className={styles.subtitle}>@{user.username}</span> : null}
      </span>
      {children}
    </div>
  );
}

/** Большая иконка с пояснением над разделами вкладки (tw-media-header). */
export function Banner({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className={styles.banner}>
      <span className={styles.bannerIcon}>
        <Icon name={icon} size={56} />
      </span>
      <p>{children}</p>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className={styles.empty}>{children}</p>;
