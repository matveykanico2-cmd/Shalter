import { useState } from "react";

import { Icon } from "@/shared/ui";

import { browserTimeZone, type BusinessStatus, DAY_KEYS, DAY_LABELS, type DayHours, formatDayHours, formatStatus } from "../lib/business-hours";

import styles from "./user-profile.module.css";

type Props = { hours: { hours: Record<string, DayHours>; timeZone: string | null; status: unknown } };

/**
 * Часы работы как в tweb (businessHours.tsx), businessHoursRow в profileDialog.js: «Открыто»/«Закрыто»
 * цветом, сегодня справа, по нажатию — вся неделя, начиная с сегодняшнего дня.
 */
export function BusinessHoursRow({ hours: bh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const status = (bh.status ?? null) as BusinessStatus | null;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const order = [...DAY_KEYS.slice(todayIdx), ...DAY_KEYS.slice(0, todayIdx)];
  const allDay = DAY_KEYS.every((k) => {
    const d = bh.hours[k];
    return d && !d.closed && d.open === "00:00" && d.close === "24:00";
  });
  const statusText = formatStatus(status, bh.hours).replace(/^(Открыто|Закрыто)( · )?/, "");
  return (
    <button type="button" className={styles.hours} aria-expanded={allDay ? undefined : expanded} onClick={() => !allDay && setExpanded((v) => !v)}>
      <span className={styles.hoursIcon}>
        <Icon name="Clock" size={24} />
      </span>
      <span className={styles.hoursBody}>
        <span className={status?.open ? styles.hoursOpen : styles.hoursClosed}>{status?.open ? "Открыто" : "Закрыто"}</span>
        <span className={styles.hoursSub}>
          <span>Часы работы</span>
          <span>{allDay ? "круглосуточно" : statusText || formatDayHours(bh.hours[order[0]!])}</span>
        </span>
        {expanded && !allDay ? (
          <span className={styles.hoursWeek}>
            {order.map((k, i) => (
              <span key={k} className={styles.hoursDay}>
                <span>{i === 0 ? "Сегодня" : DAY_LABELS[k]}</span>
                <span>{formatDayHours(bh.hours[k])}</span>
              </span>
            ))}
            {bh.timeZone && bh.timeZone !== browserTimeZone() ? <span className={styles.hoursTz}>Время по поясу {bh.timeZone.replace(/_/g, " ")}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}
