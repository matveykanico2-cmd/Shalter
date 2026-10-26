import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, SettingsPage, SettingsSection, TextField } from "@/shared/ui";

import { adminQueries, type Pricing, resetPricing, updatePricing } from "../api/admin";

import styles from "./admin.module.css";

// «Настройки → Цены и тарифы» — renderPricing в public/js/views/settings/index.js: тарифы Premium
// и бизнеса, наборы звёзд, кабинет рекламы и стоимость действий за звёзды. Уже созданные заказы
// оплачиваются по старой цене — сервер запоминает её в самом заказе.

export function PricingSection() {
  const query = useQuery(adminQueries.pricing());
  if (!query.data) {
    return (
      <SettingsPage>
        {query.isError ? <p className={styles.error}>{errorText(query.error, "Не удалось загрузить цены")}</p> : <p className={styles.hint}>Загружаем…</p>}
      </SettingsPage>
    );
  }
  return <PricingEditor initial={query.data.pricing} />;
}

type PlanKey = "premiumPlans" | "businessPlans";

function PricingEditor({ initial }: { initial: Pricing }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Pricing>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const patch = (fn: (d: Pricing) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await updatePricing(draft);
      setDraft(structuredClone(res.pricing));
      setMessage({ ok: true, text: "Сохранено. Новые цены уже действуют." });
      void client.invalidateQueries({ queryKey: adminQueries.pricing().queryKey });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Не удалось сохранить") });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!(await askConfirm("Вернуть все цены к значениям по умолчанию?"))) return;
    try {
      const res = await resetPricing();
      setDraft(structuredClone(res.pricing));
      setMessage({ ok: true, text: "Цены сброшены." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Не удалось сбросить") });
    }
  };

  const num = (value: number, onChange: (v: number) => void, label: string, attrs: { min?: string; step?: string } = {}) => (
    <TextField className={styles.mono} type="number" min={attrs.min ?? "0"} step={attrs.step} aria-label={label} value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} />
  );
  const removeBtn = (onClick: () => void) => (
    <button type="button" className={styles.iconBtn} title="Удалить" aria-label="Удалить" onClick={onClick}>
      ✕
    </button>
  );

  const planEditor = (key: PlanKey, title: string) => (
    <SettingsSection title={title}>
      <div className={styles.body}>
        <div className={`${styles.pricingRow} ${styles.pricingHead}`}>
          <span>Название</span>
          <span>Дней</span>
          <span>₽</span>
          <span />
        </div>
        {draft[key].map((p, i) => (
          <div key={p.id} className={styles.pricingRow}>
            <TextField maxLength={40} placeholder="1 месяц" aria-label="Название" value={p.label} onChange={(e) => patch((d) => void (d[key][i]!.label = e.target.value))} />
            {num(p.days, (v) => patch((d) => void (d[key][i]!.days = v)), "Дней", { min: "1" })}
            {num(p.priceRub, (v) => patch((d) => void (d[key][i]!.priceRub = v)), "₽", { min: "1" })}
            {removeBtn(() => patch((d) => void d[key].splice(i, 1)))}
          </div>
        ))}
        <button type="button" className={styles.outline} onClick={() => patch((d) => void d[key].push({ id: `p${Date.now().toString(36)}`, label: "", days: 30, priceRub: 100 }))}>
          + Добавить тариф
        </button>
      </div>
    </SettingsSection>
  );

  return (
    <SettingsPage subtitle="Меняются сразу для всех. Уже выставленные счета оплачиваются по прежней цене.">
      {planEditor("premiumPlans", "Shalter Premium")}
      {planEditor("businessPlans", "Shalter для бизнеса")}
      <SettingsSection title="Наборы звёзд">
        <div className={styles.body}>
          <div className={`${styles.pricingRow} ${styles.pricingRow3} ${styles.pricingHead}`}>
            <span>Звёзд</span>
            <span>₽</span>
            <span />
          </div>
          {draft.starPacks.map((p, i) => (
            <div key={p.id} className={`${styles.pricingRow} ${styles.pricingRow3}`}>
              {num(p.stars, (v) => patch((d) => void (d.starPacks[i]!.stars = v)), "Звёзд", { min: "1" })}
              {num(p.priceRub, (v) => patch((d) => void (d.starPacks[i]!.priceRub = v)), "₽", { min: "1" })}
              {removeBtn(() => patch((d) => void d.starPacks.splice(i, 1)))}
            </div>
          ))}
          <button type="button" className={styles.outline} onClick={() => patch((d) => void d.starPacks.push({ id: `stars_${Date.now().toString(36)}`, stars: 100, priceRub: 200 }))}>
            + Добавить набор
          </button>
        </div>
      </SettingsSection>
      <SettingsSection title="Кабинет рекламы">
        <div className={styles.body}>
          <div className={`${styles.pricingRow} ${styles.pricingRow2} ${styles.pricingHead}`}>
            <span>Дней</span>
            <span>₽</span>
          </div>
          <div className={`${styles.pricingRow} ${styles.pricingRow2}`}>
            {num(draft.ads.days, (v) => patch((d) => void (d.ads.days = v)), "Дней", { min: "1" })}
            {num(draft.ads.priceRub, (v) => patch((d) => void (d.ads.priceRub = v)), "₽", { min: "1" })}
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="Звёзды">
        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.hint}>Рублей за одну звезду при оплате Premium звёздами</span>
            {num(draft.rubPerStar, (v) => patch((d) => void (d.rubPerStar = v)), "Рублей за одну звезду", { min: "0.01", step: "0.01" })}
          </label>
          <label className={styles.field}>
            <span className={styles.hint}>Поднять сообщение, ⭐</span>
            {num(draft.starCosts.boost, (v) => patch((d) => void (d.starCosts.boost = v)), "Поднять сообщение, ⭐")}
          </label>
          <label className={styles.field}>
            <span className={styles.hint}>Удалить чужое сообщение, ⭐</span>
            {num(draft.starCosts.delete, (v) => patch((d) => void (d.starCosts.delete = v)), "Удалить чужое сообщение, ⭐")}
          </label>
        </div>
      </SettingsSection>
      {message ? <p className={message.ok ? styles.success : styles.error}>{message.text}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.accent} disabled={saving} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
        <button type="button" className={styles.outline} onClick={() => void reset()}>
          Сбросить по умолчанию
        </button>
      </div>
    </SettingsPage>
  );
}
