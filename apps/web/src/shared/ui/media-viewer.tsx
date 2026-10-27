import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icon";
import styles from "./media-viewer.module.css";

export type ViewerItem = {
  kind: "image" | "video";
  url: string;
  name?: string;
  thumbUrl?: string;
  /** Видео: «Скачать оригинал», если показана сжатая копия. */
  originalUrl?: string;
  /** Запасной адрес видео (оригинал), если копия не играет. */
  fallbackUrl?: string;
  author?: string;
  time?: string;
  caption?: string;
};

type Props = {
  items: readonly ViewerItem[];
  index: number;
  /** Чат с запретом сохранения — без скачивания. */
  canDownload?: boolean;
  onClose: () => void;
};

const MAX_ZOOM = 5;
type Load = "loading" | "ready" | "failed";

/**
 * Просмотр фото и видео — как openMediaViewer в public/js/components/mediaViewer.js:
 * листание стрелками, кнопками и свайпом, свайп вниз и Escape закрывают, колесо, двойной
 * клик и щипок увеличивают; пока грузится оригинал — миниатюра из ленты.
 */
export function MediaViewer({ items, index, canDownload = true, onClose }: Props) {
  const [at, setAt] = useState(() => Math.min(Math.max(index, 0), items.length - 1));
  const [load, setLoad] = useState<Load>("loading");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const media = useRef<HTMLImageElement & HTMLVideoElement>(null);
  const gestureAt = useRef(0);
  const item = items[at]!;

  const go = useCallback(
    (delta: number) => {
      const next = at + delta;
      if (next < 0 || next >= items.length) return;
      setAt(next);
      setLoad("loading");
      setAttempt(0);
      setView({ scale: 1, tx: 0, ty: 0 });
    },
    [at, items.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && items.length > 1 && !e.altKey) {
        e.stopPropagation();
        e.preventDefault();
        go(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [go, items.length, onClose]);

  const zoomTo = (next: number, cx: number, cy: number) => {
    const el = media.current;
    if (!el) return;
    setView((v) => {
      const scale = Math.max(1, Math.min(MAX_ZOOM, next));
      if (scale === 1) return { scale: 1, tx: 0, ty: 0 };
      const rect = el.getBoundingClientRect();
      const k = scale / v.scale;
      const ox = cx - (rect.left + rect.width / 2);
      const oy = cy - (rect.top + rect.height / 2);
      return { scale, tx: v.tx - ox * (k - 1), ty: v.ty - oy * (k - 1) };
    });
  };

  // Жесты: щипок — масштаб, перетаскивание увеличенного — сдвиг, свайп — листать или закрыть.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      swipe.current = null;
      pan.current = null;
    } else if (view.scale > 1) {
      pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    } else if (e.pointerType !== "mouse") {
      swipe.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const p = pinch.current;
      zoomTo(p.scale * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), p.cx, p.cy);
    } else if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const s = swipe.current;
    if (pan.current || pinch.current || (s && Math.abs(e.clientX - s.x) > 8)) gestureAt.current = Date.now();
    if (pointers.current.size < 2) pinch.current = null;
    if (pan.current) {
      pan.current = null;
      return;
    }
    if (!s) return;
    swipe.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Как в Telegram: свайп вниз — закрыть, вбок — листать.
    if (view.scale === 1 && dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose();
    else if (view.scale === 1 && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  };

  const sources = item.kind === "video" ? [item.url, item.fallbackUrl].filter((u): u is string => !!u) : [item.url];
  const bust = attempt > sources.length - 1 ? `${sources[0]!.includes("?") ? "&" : "?"}r=${attempt}` : "";
  const src = attempt > sources.length - 1 ? `${sources[0]}${bust}` : sources[attempt]!;
  const onError = () => {
    if (attempt + 1 < sources.length) setAttempt(attempt + 1);
    else setLoad("failed");
  };
  const retry = () => {
    setLoad("loading");
    setAttempt(Math.max(sources.length, attempt + 1));
  };
  const showThumb = item.kind === "image" && load !== "ready" && !!item.thumbUrl && item.thumbUrl !== item.url;

  const transform = { transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` };
  const download = item.originalUrl ?? item.url;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр медиа"
      onClick={(e) => {
        // Нажатие мимо картинки закрывает, как в Telegram (но не сразу после жеста).
        if ((e.target === e.currentTarget || (e.target as HTMLElement).dataset.stage) && view.scale === 1 && Date.now() - gestureAt.current > 350) onClose();
      }}
    >
      <div className={styles.viewer}>
        <div className={styles.head}>
          {item.author ? (
            <span className={styles.author}>
              <span className={styles.authorName}>{item.author}</span>
              <span className={styles.authorTime}>{[item.time, items.length > 1 ? `${at + 1} из ${items.length}` : ""].filter(Boolean).join(" · ")}</span>
            </span>
          ) : items.length > 1 ? (
            <span className={styles.counter}>
              {at + 1} из {items.length}
            </span>
          ) : null}
          <span className={styles.spacer} />
          {canDownload ? (
            item.originalUrl ? (
              <a className={styles.original} href={item.originalUrl} download={item.name || "file"} title="Скачать оригинал">
                <Icon name="Download" size={18} />
                <span>Скачать оригинал</span>
              </a>
            ) : (
              <a className={styles.iconButton} href={download} download={item.name || "file"} title="Скачать">
                <Icon name="Download" size={20} />
              </a>
            )
          ) : null}
          <button type="button" className={styles.iconButton} title="Закрыть" onClick={onClose}>
            <Icon name="X" size={20} />
          </button>
        </div>
        <div
          className={styles.stage}
          data-stage="1"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            pinch.current = pan.current = swipe.current = null;
          }}
          onWheel={(e) => {
            if (item.kind === "video") return;
            zoomTo(view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
          }}
          onDoubleClick={(e) => {
            if (item.kind === "video") return;
            if (view.scale > 1) setView({ scale: 1, tx: 0, ty: 0 });
            else zoomTo(2.5, e.clientX, e.clientY);
          }}
        >
          {item.kind === "video" ? (
            <video
              key={`${at}:${src}`}
              ref={media}
              className={styles.media}
              src={src}
              poster={item.thumbUrl}
              controls
              autoPlay
              playsInline
              preload="auto"
              onLoadedData={() => setLoad("ready")}
              onCanPlay={() => setLoad("ready")}
              onWaiting={() => setLoad("loading")}
              onError={onError}
            />
          ) : (
            <>
              {showThumb ? <img className={`${styles.media} ${styles.blur}`} src={item.thumbUrl} alt="" /> : null}
              <img
                key={`${at}:${src}`}
                ref={media}
                className={view.scale > 1 ? `${styles.media} ${styles.zoomed}` : styles.media}
                style={{ ...transform, ...(showThumb ? { position: "absolute", opacity: 0 } : null) }}
                src={src}
                alt={item.name || ""}
                decoding="async"
                draggable={false}
                onLoad={() => setLoad("ready")}
                onError={onError}
              />
            </>
          )}
          {load === "loading" ? <span className={styles.spinner} aria-label="Загрузка" /> : null}
          {load === "failed" ? (
            <div className={styles.fail}>
              <Icon name="RotateCw" size={28} />
              <span>{navigator.onLine === false ? "Нет подключения к сети" : "Не удалось загрузить"}</span>
              <div className={styles.failActions}>
                <button type="button" onClick={retry}>
                  Повторить
                </button>
                <button type="button" className={styles.secondary} onClick={onClose}>
                  Закрыть
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {item.caption ? <p className={styles.caption}>{item.caption}</p> : null}
      </div>
      {items.length > 1 ? (
        <>
          <button type="button" className={`${styles.nav} ${styles.prev}`} title="Предыдущее" disabled={at === 0} onClick={() => go(-1)}>
            <Icon name="ChevronLeft" size={26} />
          </button>
          <button type="button" className={`${styles.nav} ${styles.next}`} title="Следующее" disabled={at === items.length - 1} onClick={() => go(1)}>
            <Icon name="ChevronRight" size={26} />
          </button>
        </>
      ) : null}
    </div>,
    document.body
  );
}
