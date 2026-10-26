import { plural } from "@/shared/lib/presence";
import { Icon } from "@/shared/ui";

import { fragment, type ProofMatch } from "../lib/hugo";

import styles from "./hugo-panel.module.css";

export type HugoState = { kind: "checking" } | { kind: "error"; text: string } | { kind: "done"; matches: ProofMatch[] };

type Props = {
  state: HugoState;
  text: string;
  onFix: (match: ProofMatch, replacement: string) => void;
  onFixAll: () => void;
  onClose: () => void;
};

const TYPE_CLASS: Record<string, string | undefined> = {
  misspelling: styles.misspelling,
  typographical: styles.misspelling,
  style: styles.style,
  whitespace: styles.style,
};

/** Находки Hugo над полем ввода — как renderHugo в public/js/components/composer.js. */
export function HugoPanel({ state, text, onFix, onFixAll, onClose }: Props) {
  const close = (
    <button type="button" className={styles.close} title="Закрыть" onClick={onClose}>
      <Icon name="X" size={14} />
    </button>
  );
  if (state.kind === "checking") {
    return (
      <div className={styles.panel} role="status">
        <span className={styles.status}>Hugo проверяет текст…</span>
      </div>
    );
  }
  if (state.kind === "error" || !state.matches.length) {
    return (
      <div className={`${styles.panel} ${styles.row}`} role="status">
        <span className={`${styles.status} ${state.kind === "error" ? styles.bad : styles.good}`}>{state.kind === "error" ? state.text : "Ошибок не нашлось"}</span>
        {close}
      </div>
    );
  }
  const { matches } = state;
  const fixable = matches.filter((m) => m.replacements.length).length;
  return (
    <div className={styles.panel} role="region" aria-label="Проверка текста">
      <div className={styles.row}>
        <span className={styles.status}>
          Hugo нашёл {matches.length} {plural(matches.length, "ошибку", "ошибки", "ошибок")}
        </span>
        {fixable > 1 ? (
          <button type="button" className={styles.fixAll} onClick={onFixAll}>
            Исправить всё
          </button>
        ) : null}
        {close}
      </div>
      <div className={styles.list}>
        {matches.map((m) => (
          <div key={`${m.offset}:${m.length}`} className={`${styles.item} ${TYPE_CLASS[m.type] ?? ""}`}>
            <p className={styles.head}>
              <span className={styles.wrong}>{fragment(text, m) || "—"}</span>
              {m.replacements.length ? (
                <>
                  <span className={styles.arrow}>→</span>
                  <span className={styles.right}>{m.replacements[0]}</span>
                </>
              ) : null}
            </p>
            <p className={styles.message}>{m.message}</p>
            {m.replacements.length ? (
              <div className={styles.fixes}>
                {m.replacements.slice(0, 3).map((r, i) => (
                  <button key={r} type="button" className={i === 0 ? `${styles.fix} ${styles.primary}` : styles.fix} onClick={() => onFix(m, r)}>
                    {r}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
