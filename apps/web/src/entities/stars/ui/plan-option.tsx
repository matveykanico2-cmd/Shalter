import type { PlanRow } from "../lib/plans";

import styles from "./plan-option.module.css";

/** Тариф строкой-радио (tw-plan): скидка, срок, цена за срок и за месяц. */
export function PlanOption({ plan: p, selected, disabled, onSelect }: { plan: PlanRow; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={selected ? `${styles.plan} ${styles.selected}` : styles.plan} disabled={disabled} onClick={onSelect}>
      <span className={styles.radio} />
      <span className={styles.body}>
        <span className={styles.title}>
          {p.discount > 0 ? <span className={styles.discount}>−{p.discount}%</span> : null} {p.label}
        </span>{" "}
        <span className={styles.muted}>{p.months > 1 ? `${p.priceRub} ₽ за ${p.label}` : "Оплата за месяц"}</span>
      </span>{" "}
      <span className={styles.muted}>{Math.round(p.perMonth)} ₽/мес</span>
    </button>
  );
}
