import type { remainingBody } from "@shalter/shared/schemas/auth";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

import { type BanInfo, http, ws } from "@/shared/api";
import { Icon } from "@/shared/ui";

import styles from "./ban-screen.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «2 дня 3 часа», «5 часов 12 минут», «04:59» — чем ближе конец, тем точнее. */
function formatLeft(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const hoursText = `${hours} ${plural(hours, "час", "часа", "часов")}`;
  if (days) return `${days} ${plural(days, "день", "дня", "дней")}${hours ? ` ${hoursText}` : ""}`;
  if (hours) return `${hoursText}${mins ? ` ${mins} ${plural(mins, "минута", "минуты", "минут")}` : ""}`;
  return `${pad(mins)}:${pad(total % 60)}`;
}

function formatUntil(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  return `${date} в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Выход из заблокированного аккаунта на этом устройстве: есть другие аккаунты — переключаемся
 * на первый, иначе — на экран входа.
 */
async function leave() {
  ws.stop();
  try {
    const { remaining } = await http.post<z.infer<typeof remainingBody>>("/api/auth/logout");
    if (remaining[0]) {
      await http.post("/api/auth/switch", { userId: remaining[0] });
      window.location.href = "/";
      return;
    }
  } catch {
    // Нет сети — cookie всё равно не снять; экран входа сам предложит войти заново.
  }
  window.location.href = "/login";
}

/**
 * Экран блокировки аккаунта, как в Telegram (public/js/components/banScreen.js): вместо чатов и
 * настроек — причина, до какого времени и сколько осталось, и «Назад», чтобы выйти.
 */
export function BanScreen({ ban }: { ban: BanInfo }) {
  const until = ban.bannedUntil ? Date.parse(ban.bannedUntil) : null;
  const [now, setNow] = useState(Date.now);
  const [leaving, setLeaving] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const left = until ? until - now : null;

  useEffect(() => {
    backRef.current?.focus();
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  // Срок вышел — сервер уже пускает, достаточно перезагрузить.
  useEffect(() => {
    if (left !== null && left <= 0) window.location.reload();
  }, [left]);

  return (
    <div className={styles.screen}>
      <div className={styles.card} role="alertdialog" aria-modal="true" aria-labelledby="ban-screen-title">
        <div className={styles.icon}>
          <Icon name="ShieldOff" size={44} />
        </div>
        <h1 className={styles.title} id="ban-screen-title">
          Аккаунт заблокирован
        </h1>
        <p className={styles.text}>Администрация Shalter ограничила доступ к вашему аккаунту. Пока блокировка действует, чаты и настройки недоступны.</p>
        {ban.banReason && (
          <div className={styles.reason}>
            <span className={styles.label}>Причина</span>
            <p>{ban.banReason}</p>
          </div>
        )}
        <div className={styles.term}>
          <Icon name="Clock" size={18} />
          <div>
            <p className={styles.until}>{ban.bannedUntil ? `Заблокирован до ${formatUntil(ban.bannedUntil)}` : "Блокировка бессрочная"}</p>
            {left !== null && left > 0 && <p className={styles.left}>{`Осталось ${formatLeft(left)}`}</p>}
          </div>
        </div>
        <button
          ref={backRef}
          type="button"
          className={styles.back}
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void leave();
          }}
        >
          <Icon name="ChevronLeft" size={18} />
          Назад
        </button>
        <p className={styles.hint}>«Назад» — выйти из этого аккаунта и войти в другой</p>
      </div>
    </div>
  );
}
