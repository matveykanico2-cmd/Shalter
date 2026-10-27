import { useState } from "react";

import { Icon } from "@/shared/ui";

import styles from "./holiday-banner.module.css";

// Праздники Shalter (HOLIDAYS в public/js/app.js): плашка сверху в этот день, пока её не скрыли.
const HOLIDAYS = [{ date: "09-25", title: "🎉 С Днём основания Shalter!" }];

const today = () => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function dismissedOn(mmdd: string) {
  try {
    return localStorage.getItem("holidayDismissed") === mmdd;
  } catch {
    return false;
  }
}

export function HolidayBanner() {
  const [mmdd] = useState(today);
  const holiday = HOLIDAYS.find((h) => h.date === mmdd);
  const [hidden, setHidden] = useState(() => dismissedOn(mmdd));
  if (!holiday || hidden) return null;
  return (
    <div className={styles.banner} role="status">
      <span>{holiday.title}</span>
      <button
        type="button"
        className={styles.close}
        title="Скрыть"
        aria-label="Скрыть"
        onClick={() => {
          try {
            localStorage.setItem("holidayDismissed", mmdd);
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
