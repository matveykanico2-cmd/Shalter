import styles from "./composer.module.css";

export type FormatKind = "**" | "*" | "__" | "~~" | "`" | "||" | "quote" | "link";

const ACTIONS: [string, string, FormatKind, string?][] = [
  ["Ж", "Жирный (Ctrl+B)", "**", styles.formatBold],
  ["К", "Курсив (Ctrl+I)", "*", styles.formatItalic],
  ["Ч", "Подчёркнутый (Ctrl+U)", "__", styles.formatUnderline],
  ["З", "Зачёркнутый (Ctrl+Shift+X)", "~~", styles.formatStrike],
  ["</>", "Моноширинный (Ctrl+Shift+M)", "`", styles.formatMono],
  ["▒", "Спойлер (Ctrl+Shift+P)", "||"],
  ["❝", "Цитата", "quote"],
  ["🔗", "Ссылка", "link"],
];

/** Панель форматирования над полем, пока выделен текст (composer-format-bar), как в Telegram. */
export function FormatBar({ onFormat }: { onFormat: (kind: FormatKind) => void }) {
  return (
    <div className={styles.formatBar} role="toolbar" aria-label="Форматирование">
      {ACTIONS.map(([label, title, kind, extra]) => (
        <button
          key={kind}
          type="button"
          className={extra ? `${styles.formatButton} ${extra}` : styles.formatButton}
          title={title}
          aria-label={title}
          // mousedown + preventDefault — чтобы поле не теряло выделение.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(kind)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
