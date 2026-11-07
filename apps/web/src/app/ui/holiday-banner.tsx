import { useState } from "react";

import type { Settings } from "@/entities/settings";

import { Icon } from "@/shared/ui";

import styles from "./holiday-banner.module.css";

// Тот же встроенный календарь, что отдаёт Settings API; свои праздники приходят из настроек.
const HOLIDAYS = [
  ["shalter_day", "09-25", "День основания Shalter"], ["new_year", "01-01", "Новый год"], ["orthodox_christmas", "01-07", "Рождество"],
  ["defender_day", "02-23", "День защитника Отечества"], ["international_women_day", "03-08", "Международный женский день"],
  ["astronaut_day", "04-12", "День космонавтики"], ["labor_day", "05-01", "Праздник весны и труда"], ["victory_day", "05-09", "День Победы"],
  ["russia_day", "06-12", "День России"], ["knowledge_day", "09-01", "День знаний"], ["teacher_day", "10-05", "День учителя"],
  ["unity_day", "11-04", "День народного единства"],
].map(([id, date, title]) => ({ id: id!, date: date!, title: title! }));

const today = () => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function dismissedOn(key: string) {
  try {
    return localStorage.getItem("holidayDismissed") === key;
  } catch {
    return false;
  }
}

export function HolidayBanner({ settings }: { settings?: Settings }) {
  const [mmdd] = useState(today);
  const disabled = new Set(settings?.holidays?.disabled ?? []);
  const holiday = [...HOLIDAYS, ...(settings?.holidays?.custom ?? [])].find((h) => h.date === mmdd && !disabled.has(h.id));
  const key = `${new Date().getFullYear()}:${holiday?.id ?? mmdd}`;
  const [hidden, setHidden] = useState(() => dismissedOn(key));
  if (!holiday || hidden) return null;
  return (
    <div className={settings?.reduceMotion ? `${styles.banner} ${styles.reduced}` : styles.banner} role="status">
      <span className={styles.sparkles} aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} />)}</span>
      <span className={styles.title}>🎉 Сегодня {holiday.title}!</span>
      <button
        type="button"
        className={styles.close}
        title="Скрыть"
        aria-label="Скрыть"
        onClick={() => {
          try {
            localStorage.setItem("holidayDismissed", key);
          } catch {
            // Хранилище недоступно — скрываем до перезагрузки.
          }
          setHidden(true);
        }}
      >
        <Icon name="X" size={14} />
      </button>
    </div>
  );
}
