import type { CommandSuggestion } from "../lib/slash-commands";

import styles from "./composer.module.css";

export type MentionUser = { id: string; name: string; username?: string | null };
export type Suggestion = { kind: "mention"; user: MentionUser } | { kind: "command"; command: CommandSuggestion };

type Props = { items: readonly Suggestion[]; active: number; error: string | null; onPick: (s: Suggestion) => void };

/** Меню над полем: @участники или /команды (composer-mention-menu в composer.js). */
export function SuggestMenu({ items, active, error, onPick }: Props) {
  if (error) {
    return (
      <div className={styles.suggest}>
        <p className={styles.suggestError}>{error}</p>
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className={styles.suggest} role="listbox" aria-label="Подсказки">
      {items.map((s, i) => (
        <button
          key={s.kind === "mention" ? s.user.id : s.command.name}
          type="button"
          role="option"
          aria-selected={i === active}
          className={i === active ? `${styles.suggestItem} ${styles.suggestActive}` : styles.suggestItem}
          // mousedown — чтобы поле не теряло фокус.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(s);
          }}
        >
          {s.kind === "mention" ? (
            <>
              <span className={styles.suggestName}>{s.user.name}</span>
              <span className={styles.suggestMuted}>@{s.user.username}</span>
            </>
          ) : (
            <>
              <span className={styles.suggestCommand}>
                /{s.command.name}
                {s.command.hint ? <span className={styles.suggestMuted}> {s.command.hint}</span> : null}
              </span>
              <span className={styles.suggestMuted}>{s.command.description}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
