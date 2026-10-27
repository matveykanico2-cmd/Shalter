import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Icon, SettingsPage, SettingsSection, TextField, toast } from "@/shared/ui";

import { adminQueries, createPromoCode, deletePromoCode, type NewPromoCode, type PromoCode, type PromoPrize } from "../api/admin";

import styles from "./admin.module.css";

// «Настройки → Промокоды» — renderPromotions в public/js/views/settings/index.js. Раздел
// открывает право «Цены» (pricing): промокод раздаёт то, что иначе продаётся.

const PRIZES: { value: PromoPrize; label: string }[] = [
  { value: "premium", label: "Shalter Premium" },
  { value: "stars", label: "Звёзды" },
  { value: "ads", label: "Кабинет рекламы" },
  { value: "business", label: "Shalter для бизнеса" },
];

const PRIZE_TITLES: Record<string, string> = {
  premium: "Shalter Premium",
  stars: "звёзды",
  ads: "кабинет рекламы",
  business: "Shalter для бизнеса",
};

type Form = { code: string; prize: PromoPrize; days: string; stars: string; usesTotal: string };
const EMPTY_FORM: Form = { code: "", prize: "premium", days: "30", stars: "100", usesTotal: "" };

export function PromotionsSection() {
  const client = useQueryClient();
  const query = useQuery(adminQueries.promotions());
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStars = form.prize === "stars";
  const refresh = () => client.invalidateQueries({ queryKey: adminQueries.promotions().queryKey });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body: NewPromoCode = {
        prize: form.prize,
        config: isStars ? { amount: Number(form.stars) } : { days: Number(form.days) },
        usesTotal: form.usesTotal.trim() ? Number(form.usesTotal) : null,
      };
      if (form.code.trim()) body.code = form.code.trim();
      const { code } = await createPromoCode(body);
      setForm(EMPTY_FORM);
      toast(`Промокод ${code.code} создан`);
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось создать промокод"));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (c: PromoCode) => {
    if (!(await askConfirm(`Удалить промокод «${c.code}»?`))) return;
    try {
      await deletePromoCode(c.id);
      client.setQueryData(adminQueries.promotions().queryKey, (list) => list?.filter((x) => x.id !== c.id));
      void refresh();
    } catch (err) {
      toast(errorText(err, "Не удалось удалить"), { error: true });
    }
  };

  const codes = query.data;

  return (
    <SettingsPage subtitle="Создавайте промокоды с одноразовой активацией на аккаунт">
      <SettingsSection title="Новый промокод" caption="Активируется один раз на каждый аккаунт. Приз — подарок пользователю.">
        <form className={styles.body} onSubmit={(e) => void create(e)}>
          <TextField
            className={styles.mono}
            placeholder="Код (оставьте пустым — сгенерируем)"
            aria-label="Код"
            autoComplete="off"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <select className={styles.select} aria-label="Приз" value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value as PromoPrize })}>
            {PRIZES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <TextField
            type="number"
            min="1"
            placeholder={isStars ? "100" : "30"}
            aria-label={isStars ? "Количество звёзд" : "Количество дней"}
            value={isStars ? form.stars : form.days}
            onChange={(e) => setForm(isStars ? { ...form, stars: e.target.value } : { ...form, days: e.target.value })}
          />
          <p className={styles.hint}>{isStars ? "Количество звёзд в подарок" : "Количество дней в подарок"}</p>
          <TextField
            type="number"
            min="1"
            placeholder="Лимит активаций (оставьте пустым — неограниченно)"
            aria-label="Лимит активаций"
            value={form.usesTotal}
            onChange={(e) => setForm({ ...form, usesTotal: e.target.value })}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" className={styles.accent} disabled={creating}>
            {creating ? "Создаём…" : "Создать промокод"}
          </button>
        </form>
      </SettingsSection>
      <SettingsSection title="Существующие промокоды">
        {query.isError ? (
          <p className={styles.empty}>{errorText(query.error, "Не удалось загрузить промокоды")}</p>
        ) : !codes ? (
          <p className={styles.empty}>Загружаем…</p>
        ) : codes.length === 0 ? (
          <p className={styles.empty}>Промокодов пока нет</p>
        ) : (
          codes.map((c) => (
            <div key={c.id} className={styles.promoRow}>
              <div className={styles.rowBody}>
                <p className={`${styles.promoCode} ${styles.mono}`}>{c.code}</p>
                <p className={styles.rowMeta}>{promoMeta(c)}</p>
              </div>
              <button type="button" className={styles.iconBtn} title="Скопировать" aria-label={`Скопировать ${c.code}`} onClick={() => void copyText(c.code)}>
                <Icon name="Copy" size={15} />
              </button>
              <button type="button" className={`${styles.iconBtn} ${styles.danger}`} title="Удалить" aria-label={`Удалить ${c.code}`} onClick={() => void remove(c)}>
                <Icon name="Trash" size={15} />
              </button>
            </div>
          ))
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

/** «Shalter Premium · 3/10» или «звёзды · без лимита». */
function promoMeta(c: PromoCode) {
  const title = PRIZE_TITLES[c.prize] ?? c.prize;
  return `${title} · ${c.usesTotal != null ? `${c.used}/${c.usesTotal}` : "без лимита"}`;
}
