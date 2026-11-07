import { useMemo, useState } from "react";

import styles from "./birthday-field.module.css";

type Props = { value?: string | null; onChange: (iso: string | null, error: string | null) => void };
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

function parts(value?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return { year: match?.[1] ?? "", month: match?.[2] ?? "", day: match?.[3] ?? "" };
}

const daysIn = (month: string, year: string) => (!month ? 31 : new Date(Number(year) || 2000, Number(month), 0).getDate());

/** Дата рождения без ручного набора: день, месяц и год выбираются отдельно. */
export function BirthdayField({ value, onChange }: Props) {
  const initial = parts(value);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const years = useMemo(() => Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => String(new Date().getFullYear() - i)), []);
  const emit = (d: string, m: string, y: string) => {
    if (!d && !m && !y) return onChange("", null);
    if (!d || !m || !y) return onChange(null, "выберите день, месяц и год");
    if (Number(d) > daysIn(m, y)) return onChange(null, "такого дня в выбранном месяце нет");
    onChange(`${y}-${m}-${d}`, null);
  };
  const clamp = (d: string, m: string, y: string) => (d && Number(d) > daysIn(m, y) ? String(daysIn(m, y)).padStart(2, "0") : d);

  return (
    <div className={styles.row} role="group" aria-label="Дата рождения">
      <select className={styles.select} aria-label="День рождения" value={day} onChange={(e) => { setDay(e.target.value); emit(e.target.value, month, year); }}>
        <option value="">День</option>
        {Array.from({ length: daysIn(month, year) }, (_, i) => String(i + 1).padStart(2, "0")).map((v) => <option key={v} value={v}>{Number(v)}</option>)}
      </select>
      <select className={`${styles.select} ${styles.month}`} aria-label="Месяц рождения" value={month} onChange={(e) => { const m = e.target.value; const d = clamp(day, m, year); setMonth(m); setDay(d); emit(d, m, year); }}>
        <option value="">Месяц</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>)}
      </select>
      <select className={styles.select} aria-label="Год рождения" value={year} onChange={(e) => { const y = e.target.value; const d = clamp(day, month, y); setYear(y); setDay(d); emit(d, month, y); }}>
        <option value="">Год</option>
        {years.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}
