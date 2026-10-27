import { useQuery } from "@tanstack/react-query";

import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";

import { type ChannelStats as Stats, channelStatsQueries } from "../api/channel-stats";

import styles from "./channel-stats.module.css";

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const views = (n: number) => plural(n, "просмотр", "просмотра", "просмотров");
const comments = (n: number) => plural(n, "комментарий", "комментария", "комментариев");

/** «ДД.ММ»: день из byDay («2026-10-26») — как есть, время поста — в поясе читателя. */
function dayLabel(date: string) {
  const [, month, day] = /^\d{4}-(\d{2})-(\d{2})$/.exec(date) ?? [];
  if (month && day) return `${day}.${month}`;
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Статистика канала — как public/js/components/channelStats.js. */
export function ChannelStats({ chatId }: { chatId: string }) {
  const stats = useQuery(channelStatsQueries.stats(chatId));
  if (stats.isError) return <p className={styles.error}>{errorText(stats.error, "Статистика недоступна")}</p>;
  if (!stats.data) return <p className={styles.empty}>Считаем…</p>;
  return <StatsBody stats={stats.data} />;
}

function StatsBody({ stats }: { stats: Stats }) {
  const peak = Math.max(1, ...stats.byDay.map((d) => d.views));
  return (
    <div className={styles.stats}>
      <div className={styles.tiles}>
        <Tile value={stats.subscribers} label={plural(stats.subscribers, "подписчик", "подписчика", "подписчиков")} />
        <Tile value={stats.posts} label={plural(stats.posts, "пост", "поста", "постов")} />
        <Tile value={stats.views} label={views(stats.views)} />
        <Tile value={stats.averageViews} label="в среднем на пост" />
        <Tile value={stats.comments} label={comments(stats.comments)} />
        <Tile value={stats.reactions} label={plural(stats.reactions, "реакция", "реакции", "реакций")} />
      </div>
      <p className={styles.label}>Просмотры по дням (2 недели)</p>
      <div className={styles.chart}>
        {stats.byDay.map((d) => (
          <div key={d.date} className={styles.col} title={`${dayLabel(d.date)}: ${fmt(d.views)} ${views(d.views)}, постов — ${d.posts}`}>
            <div className={styles.bar} style={{ height: `${Math.round((d.views / peak) * 100)}%` }} />
            <span className={styles.day}>{dayLabel(d.date).slice(0, 2)}</span>
          </div>
        ))}
      </div>
      <p className={styles.label}>Самые читаемые посты</p>
      {stats.top.length ? (
        stats.top.map((p) => (
          <div key={p.id} className={styles.top}>
            <p className={styles.topText}>{p.text || "Без текста"}</p>
            <p className={styles.topMeta}>
              {fmt(p.views)} {views(p.views)} · {fmt(p.commentCount)} {comments(p.commentCount)} · {dayLabel(p.createdAt)}
            </p>
          </div>
        ))
      ) : (
        <p className={styles.empty}>Постов пока нет</p>
      )}
    </div>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.value}>{fmt(value)}</span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}
