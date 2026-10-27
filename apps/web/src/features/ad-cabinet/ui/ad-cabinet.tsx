import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { starsQueries } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Button, EmojiText, Icon } from "@/shared/ui";

import {
  adsQueries,
  type Campaign,
  type CampaignFields,
  campaignStats,
  createCampaign,
  deleteCampaign,
  type Placement,
  setCampaignStatus,
  topUpCampaign,
  updateCampaign,
} from "../api/ads";

import styles from "./ads.module.css";

const STATUS: Record<string, { label: string; tone: "muted" | "warn" | "ok" | "danger" }> = {
  draft: { label: "Черновик", tone: "muted" },
  review: { label: "На проверке", tone: "warn" },
  active: { label: "Идёт показ", tone: "ok" },
  paused: { label: "На паузе", tone: "muted" },
  rejected: { label: "Отклонено", tone: "danger" },
  finished: { label: "Бюджет закончился", tone: "muted" },
};

const fmt = (n: number | null | undefined) => new Intl.NumberFormat("ru-RU").format(n ?? 0);
const ctr = (c: Campaign) => (c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(1) : "0.0");

type Daily = { day: string; impressions: number; clicks: number }[];

/**
 * Кабинет рекламных кампаний (AdCabinet в public/js/components/adCabinet.js): баланс звёзд,
 * кампании с бюджетом, статусом и статистикой, форма новой кампании.
 */
export function AdCabinet() {
  const client = useQueryClient();
  const query = useQuery(adsQueries.campaigns());
  const [editing, setEditing] = useState<string | null>(null);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setError(null);
      await client.refetchQueries({ queryKey: adsQueries.campaigns().queryKey });
      void client.invalidateQueries({ queryKey: starsQueries.info().queryKey });
    } catch (err) {
      setError(errorText(err, "Не получилось"));
    }
    setBusy(false);
  };

  const data = query.data;
  if (!data) {
    return query.error ? <p className={styles.error}>{errorText(query.error, "Не удалось загрузить кабинет")}</p> : <p className={styles.hint}>Загружаем кабинет…</p>;
  }

  const toggleStats = async (c: Campaign) => {
    const next = statsFor === c.id ? null : c.id;
    setStatsFor(next);
    setDaily(null);
    if (next) setDaily(await campaignStats(c.id).then((s) => s.daily, () => null));
  };

  const save = (c: Campaign | null, fields: CampaignFields) =>
    act(async () => {
      if (c) await updateCampaign(c.id, fields);
      else await createCampaign(fields);
      setEditing(null);
    });

  const form = (c: Campaign | null) => (
    <CampaignForm
      campaign={c}
      placements={data.placements}
      cpmMin={data.cpmMin}
      busy={busy}
      onSubmit={(fields) => void save(c, fields)}
      onCancel={() => setEditing(null)}
    />
  );

  return (
    <div className={styles.cabinet}>
      <div className={styles.balance}>
        <Icon name="Zap" size={16} />
        <p>
          <strong>
            <EmojiText text={`⭐ ${fmt(data.balanceStars)}`} />
          </strong>{" "}
          на балансе — из них и оплачивается показ
        </p>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {editing === "new" ? (
        form(null)
      ) : (
        <Button className={styles.newButton} onClick={() => setEditing("new")}>
          <Icon name="Plus" size={15} />
          Новая кампания
        </Button>
      )}

      {data.campaigns.length === 0 && editing !== "new" ? (
        <p className={styles.empty}>Кампаний пока нет. Создайте первую — она сразу уйдёт на проверку, а после ответа администрации её можно включить.</p>
      ) : null}

      {data.campaigns.map((c) => {
        const st = STATUS[c.status] ?? STATUS.draft!;
        const spentPct = c.budgetStars ? Math.min(100, Math.round((c.spentStars / c.budgetStars) * 100)) : 0;
        return (
          <div key={c.id} className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <p className={styles.cardTitle}>{c.title || "Без названия"}</p>
                <p className={styles.cardPlace}>{(c.placements.length ? c.placements : [c.placement]).map((p) => data.placements[p as Placement] ?? p).join(" · ")}</p>
              </div>
              <span className={`${styles.status} ${styles[st.tone]}`}>{st.label}</span>
            </div>
            <p className={styles.cardText}>{c.text}</p>
            {c.rejectReason ? <p className={styles.error}>Причина отказа: {c.rejectReason}</p> : null}

            <div className={styles.stats}>
              <Stat value={fmt(c.impressions)} label="показов" />
              <Stat value={fmt(c.clicks)} label="кликов" />
              <Stat value={`${ctr(c)}%`} label="CTR" />
              <Stat value={`⭐ ${fmt(c.spentStars)}`} label="потрачено" />
            </div>

            <div className={styles.budget}>
              <div className={styles.budgetBar}>
                <div className={styles.budgetFill} style={{ width: `${spentPct}%` }} />
              </div>
              <p className={styles.hint}>
                <EmojiText text={`Бюджет ⭐ ${fmt(c.budgetStars)} · осталось ⭐ ${fmt(c.remainingStars)}`} />
              </p>
            </div>

            <div className={styles.actions}>
              {c.status === "rejected" ? (
                <Button disabled={busy} onClick={() => void act(() => setCampaignStatus(c.id, "review"))}>
                  На проверку
                </Button>
              ) : null}
              {c.status === "paused" || c.status === "finished" ? (
                <Button disabled={busy} onClick={() => void act(() => setCampaignStatus(c.id, "active"))}>
                  Включить показ
                </Button>
              ) : null}
              {c.status === "active" ? (
                <Button variant="secondary" disabled={busy} onClick={() => void act(() => setCampaignStatus(c.id, "paused"))}>
                  Пауза
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={async () => {
                  const stars = Number(await askText("Сколько звёзд добавить в бюджет?", { okLabel: "OK", initial: "500" }));
                  if (stars > 0) void act(() => topUpCampaign(c.id, stars));
                }}
              >
                Пополнить
              </Button>
              <Button variant="secondary" onClick={() => setEditing(c.id)}>
                Изменить
              </Button>
              <Button variant="secondary" onClick={() => void toggleStats(c)}>
                {statsFor === c.id ? "Скрыть график" : "График"}
              </Button>
              <Button
                variant="secondary"
                className={styles.danger}
                onClick={async () => {
                  if (await askConfirm(`Удалить кампанию «${c.title || "без названия"}»?`, { okLabel: "Удалить", danger: true })) void act(() => deleteCampaign(c.id));
                }}
              >
                Удалить
              </Button>
            </div>
            {statsFor === c.id ? <Chart daily={daily} /> : null}
            {editing === c.id ? form(c) : null}
          </div>
        );
      })}

      <div className={styles.notes}>
        <p className={styles.notesTitle}>Как это устроено</p>
        <p className={styles.hint}>Оплата — звёздами, за показы: цена задаётся за тысячу. Деньги списываются по мере показа, остаток всегда виден в карточке.</p>
        <p className={styles.hint}>
          Созданная кампания сразу уходит на проверку к администрации Shalter и до её ответа не показывается никому. Ответ придёт сообщением в чат: допущено или отклонено с причиной. Изменили текст — объявление уходит на проверку снова.
        </p>
        <p className={styles.hint}>
          Нацеливания на человека нет: выбрать можно только место показа. Реклама, которая целится в человека, требует слежки за ним, — этого в Shalter не будет.
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.stat}>
      <p className={styles.statValue}>
        <EmojiText text={value} />
      </p>
      <p className={styles.statLabel}>{label}</p>
    </div>
  );
}

function Chart({ daily }: { daily: Daily | null }) {
  if (!daily?.length) return <p className={styles.hint}>Показов пока не было</p>;
  const max = Math.max(...daily.map((d) => d.impressions), 1);
  return (
    <div className={styles.chart}>
      {daily.map((d) => (
        <div key={d.day} className={styles.chartCol} title={`${d.day}: ${d.impressions} показов, ${d.clicks} кликов`}>
          <div className={styles.chartBar} style={{ height: `${Math.max(4, (d.impressions / max) * 100)}%` }} />
          <span className={styles.chartDay}>{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

type FormProps = {
  campaign: Campaign | null;
  placements: Record<Placement, string>;
  cpmMin: number;
  busy: boolean;
  onSubmit: (fields: CampaignFields) => void;
  onCancel: () => void;
};

function CampaignForm({ campaign: c, placements: labels, cpmMin, busy, onSubmit, onCancel }: FormProps) {
  const [title, setTitle] = useState(c?.title ?? "");
  const [text, setText] = useState(c?.text ?? "");
  const [url, setUrl] = useState(c?.url ?? "");
  const [cpm, setCpm] = useState(String(c?.cpmStars ?? 20));
  const [placements, setPlacements] = useState<Placement[]>(c?.placements.length ? [...c.placements] : ["discover"]);
  // Переключение, но хотя бы одно место остаётся выбранным.
  const toggle = (p: Placement) =>
    setPlacements((cur) => (!cur.includes(p) ? [...cur, p] : cur.length > 1 ? cur.filter((x) => x !== p) : cur));
  return (
    <div className={styles.form}>
      <p className={styles.label}>Название кампании</p>
      <input className={styles.input} placeholder="Название — только для вас, например «Осенняя распродажа»" value={title} onChange={(e) => setTitle(e.target.value)} />
      <p className={styles.label}>Объявление</p>
      <textarea className={styles.input} rows={3} maxLength={200} placeholder="Текст объявления — до 200 символов" value={text} onChange={(e) => setText(e.target.value)} />
      <p className={styles.label}>Ссылка</p>
      <input className={`${styles.input} ${styles.mono}`} placeholder="Ссылка: https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <p className={styles.label}>Где показывать — можно выбрать несколько</p>
      <div className={styles.placements}>
        {(Object.entries(labels) as [Placement, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={placements.includes(id)}
            className={placements.includes(id) ? `${styles.placement} ${styles.placementActive}` : styles.placement}
            onClick={() => toggle(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className={styles.label}>Цена за 1000 показов, звёзд</p>
      <input className={`${styles.input} ${styles.mono}`} type="number" min={5} value={cpm} onChange={(e) => setCpm(e.target.value)} />
      <p className={styles.hint}>Чем больше цена, тем чаще объявление попадает в показ. Минимум — {cpmMin} звёзд за тысячу.</p>
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => onSubmit({ title, text, url, placements, cpmStars: Number(cpm) })}>
          {c ? "Сохранить" : "Создать и отправить на проверку"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
