import type { MouseEvent, ReactNode } from "react";

import { chatMembersLabel, type CommunityChat } from "@/entities/community";

import { Avatar, Icon, type IconName } from "@/shared/ui";

import styles from "./community-editor.module.css";

export type Option<T> = { value: T; title: string; sub: string };

/** Варианты с одним выбором — radioRows в communityEditor.js. */
export function RadioRows<T>({ options, value, onChange, disabled, label }: { options: readonly Option<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} className={styles.row} onClick={() => onChange(o.value)}>
          <span className={value === o.value ? `${styles.radio} ${styles.radioOn}` : styles.radio} />
          <span className={styles.rowBody}>
            <span>{o.title}</span>
            <span className={styles.rowSub}>{o.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

type RowProps = { icon?: IconName; title: string; subtitle?: string | null; right?: ReactNode; danger?: boolean; accent?: boolean; onClick?: (e: MouseEvent) => void };

/** Строка-пункт: иконка, название, справа число — row() в communityEditor.js. */
export function Row({ icon, title, subtitle, right, danger, accent, onClick }: RowProps) {
  const className = [styles.row, danger ? styles.danger : "", accent ? styles.accent : ""].filter(Boolean).join(" ");
  const content = (
    <>
      {icon ? (
        <span className={styles.rowIcon}>
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{title}</span>
        {subtitle ? <span className={styles.rowSub}>{subtitle}</span> : null}
      </span>
      {right != null ? <span className={styles.rowRight}>{right}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

type Chatish = Pick<CommunityChat, "id" | "type" | "title" | "avatarColor" | "avatarImage"> & { username?: string | null; members?: number | null; visible?: boolean };

/** Чат в списках сообщества — chatRow() в communityEditor.js. */
export function ChatLine({ chat, onClick, right }: { chat: Chatish; onClick?: () => void; right?: ReactNode }) {
  const body = (
    <>
      <Avatar size={42} name={chat.title ?? ""} color={chat.avatarColor} image={chat.avatarImage} />
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>
          {chat.type === "channel" ? <Icon name="Megaphone" size={14} /> : null}
          <span>{chat.title}</span>
          {chat.visible === false ? (
            <span title="Скрытый чат">
              <Icon name="EyeOff" size={14} />
            </span>
          ) : null}
        </span>
        <span className={styles.rowSub}>{chat.username ? `@${chat.username} · ${chatMembersLabel(chat)}` : chatMembersLabel(chat)}</span>
      </span>
    </>
  );
  return (
    <div className={styles.row}>
      {onClick ? (
        <button type="button" className={styles.row} onClick={onClick}>
          {body}
        </button>
      ) : (
        body
      )}
      {right}
    </div>
  );
}

type Person = { id: string; name?: string | null; avatarColor?: string | null; avatarImage?: string | null };

/** Человек в списках сообщества — userRow() в communityEditor.js. */
export function UserLine({ user, subtitle, right, onClick }: { user: Person; subtitle?: string | null; right?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <Avatar size={42} name={user.name ?? "Пользователь"} color={user.avatarColor} image={user.avatarImage} />
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{user.name ?? "Пользователь"}</span>
        {subtitle ? <span className={styles.rowSub}>{subtitle}</span> : null}
      </span>
    </>
  );
  return (
    <div className={styles.row}>
      {onClick ? (
        <button type="button" className={styles.row} onClick={onClick}>
          {body}
        </button>
      ) : (
        body
      )}
      {right}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className={styles.caption}>{children}</p>;
