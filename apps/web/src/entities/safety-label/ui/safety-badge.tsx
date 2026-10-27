import { useSafetyLabel } from "../model/use-safety-label";

import styles from "./safety-badge.module.css";

const KIND_CLASS: Record<string, string | undefined> = {
  terrorism: styles.dark,
  extremism: styles.dark,
  fake: styles.fake,
  drugs: styles.drugs,
};

/**
 * Плашка метки рядом с именем (.safety-badge): «СКАМ», «ФЕЙК».
 * mini — в строке списка чатов и в шапке переписки.
 */
export function SafetyBadge({ label, mini }: { label: string; mini?: boolean }) {
  const info = useSafetyLabel(label);
  if (!info) return null;
  const cls = [styles.badge, mini && styles.mini, KIND_CLASS[label]].filter(Boolean).join(" ");
  return (
    <span className={cls} title={info.hint}>
      {info.short}
    </span>
  );
}

/** Плашка с заданным текстом и цветом — каталог меток в «Модерации». */
export function SafetyBadgePreview({ short, color }: { short: string; color: string }) {
  return (
    <span className={`${styles.badge} ${styles.mini}`} style={{ background: color, color: "#fff" }}>
      {short}
    </span>
  );
}
