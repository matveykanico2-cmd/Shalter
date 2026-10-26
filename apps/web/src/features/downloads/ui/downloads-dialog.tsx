import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { clearDownloads, type Download, removeDownload, useDownloads } from "@/shared/lib/downloads";
import { askConfirm, Icon, type IconName, MediaViewer, TextField } from "@/shared/ui";

import { DownloadViewer } from "./download-viewer";
import styles from "./downloads.module.css";

const TABS = [
  { id: "all", label: "Все" },
  { id: "image", label: "Фото" },
  { id: "video", label: "Видео" },
  { id: "audio", label: "Музыка" },
  { id: "doc", label: "Файлы" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ICON: Record<Download["kind"], IconName> = { image: "Image", video: "Video", audio: "Volume", pdf: "File", text: "File", file: "File" };

function sizeText(bytes: number) {
  if (!bytes) return "";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i ? 1 : 0).replace(".", ",")} ${units[i]}`;
}

const when = (ts: number) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
};

const matchTab = (d: Download, tab: Tab) => tab === "all" || (tab === "doc" ? d.kind === "pdf" || d.kind === "text" || d.kind === "file" : d.kind === tab);

/** «Загрузки» (public/js/components/downloadsDialog.js): скачанное из чатов с поиском и вкладками. */
export function DownloadsDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const all = useDownloads();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Download | null>(null);
  const q = query.trim().toLowerCase();
  const items = all.filter((d) => (!q || d.name.toLowerCase().includes(q)) && matchTab(d, tab));
  const media = items.filter((d) => d.kind === "image" || d.kind === "video");

  const clear = async () => {
    if (await askConfirm("Очистить список загрузок? Файлы в чатах останутся.", { okLabel: "Очистить", danger: true })) clearDownloads();
  };

  // Фото и видео — общим просмотрщиком, остальное — своим окном поверх.
  if (open && (open.kind === "image" || open.kind === "video")) {
    return (
      <MediaViewer
        items={media.map((x) => ({ kind: x.kind as "image" | "video", url: x.url, name: x.name, originalUrl: x.url, caption: x.name }))}
        index={Math.max(0, media.findIndex((x) => x.url === open.url))}
        onClose={() => setOpen(null)}
      />
    );
  }
  if (open) return <DownloadViewer item={open} onClose={() => setOpen(null)} />;

  return createPortal(
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="downloads-title">
        <div className={styles.head}>
          <h2 id="downloads-title" className={styles.title}>
            Загрузки
          </h2>
          <button type="button" className={styles.iconButton} title="Очистить список" aria-label="Очистить список" onClick={() => void clear()}>
            <Icon name="Trash" size={18} />
          </button>
          <button type="button" className={styles.iconButton} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
            <Icon name="X" size={20} />
          </button>
        </div>
        <TextField placeholder="Поиск по названию" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} className={tab === t.id ? `${styles.tab} ${styles.active}` : styles.tab} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.list}>
          {items.length ? (
            items.map((d) => (
              <div key={d.url} className={styles.row}>
                <button type="button" className={styles.rowMain} onClick={() => setOpen(d)}>
                  {d.kind === "image" ? (
                    <span className={styles.thumb} style={{ backgroundImage: `url("${d.url}")` }} />
                  ) : (
                    <span className={styles.fileIcon}>
                      <Icon name={ICON[d.kind]} size={20} />
                    </span>
                  )}
                  <span className={styles.info}>
                    <span className={styles.name}>{d.name}</span>
                    <span className={styles.meta}>{[sizeText(d.size), when(d.at)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
                {d.chatPath?.startsWith("/chat/") && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Показать в чате"
                    aria-label="Показать в чате"
                    onClick={() => {
                      onClose();
                      void navigate(d.chatPath ?? "/");
                    }}
                  >
                    <Icon name="MessageCircle" size={18} />
                  </button>
                )}
                <button type="button" className={styles.iconButton} title="Убрать из списка" aria-label="Убрать из списка" onClick={() => removeDownload(d.url)}>
                  <Icon name="Trash" size={18} />
                </button>
              </div>
            ))
          ) : (
            <div className={styles.empty}>
              <Icon name="Download" size={40} />
              <p>{all.length ? "Ничего не найдено" : "Здесь появятся файлы, фото и видео, которые вы скачаете из чатов"}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
