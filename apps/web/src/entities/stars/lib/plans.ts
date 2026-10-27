// Тарифы Premium и бизнес-подписки строками (premiumPlanRows в public/js/views/settings/index.js).
type Plan = { days: number; priceRub: number; label: string };

export type PlanRow<P extends Plan = Plan> = P & { id: string; months: number; perMonth: number; discount: number };

/** Тарифы строками со скидкой против самого короткого. */
export function planRows<P extends Plan>(plans: Record<string, P> | undefined): PlanRow<P>[] {
  const rows: PlanRow<P>[] = Object.entries(plans ?? {}).map(([id, plan]) => {
    const months = Math.max(1, Math.round(plan.days / 30));
    return { ...plan, id, months, perMonth: plan.priceRub / months, discount: 0 };
  });
  const base = rows.reduce<PlanRow<P> | null>((min, r) => (min && min.months <= r.months ? min : r), null);
  for (const r of rows) r.discount = base && r !== base ? Math.round((1 - r.perMonth / base.perMonth) * 100) : 0;
  return rows;
}

/** Самый выгодный тариф — выбран по умолчанию. */
export const bestPlan = (rows: readonly PlanRow[]) => rows.reduce<PlanRow | null>((best, p) => (best && best.discount >= p.discount ? best : p), null)?.id ?? null;
