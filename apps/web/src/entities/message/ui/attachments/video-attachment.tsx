import { type CSSProperties, type MouseEvent, useState } from "react";

import { notifyMediaError } from "@/shared/lib/media/download-notify";
import { Icon } from "@/shared/ui";

import { clockTime, mediaItem } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";

import styles from "./attachments.module.css";
import { MediaTile } from "./media-tile";

const VIDEO_MAX_H = 420;
// Сжатая копия делается в фоне за минуты. Метка «обрабатывается» старше часа — задача
// потерялась (до очереди в базе обработка жила в памяти и пропадала при перезапуске):
// показываем обычное видео — открывается оригинал, — а не вечный индикатор.
const PENDING_MAX_MS = 60 * 60 * 1000;

type Props = {
  attachment: Attachment;
  messageId: string;
  /** createdAt сообщения — чтобы не показывать вечную «обработку» у старых видео. */
  sentAt?: string;
  inAlbum?: boolean;
  priority?: boolean;
  onOpen?: () => void;
  onDoubleTap?: (at: { x: number; y: number }) => void;
};

const withBust = (url: string, bust: string) => (bust ? `${url}${url.includes("?") ? "&" : "?"}r=${bust}` : url);

/**
 * Видео — VideoAttachment из attachments.js: обложка (или первый кадр самого ролика),
 * кнопка Play, длительность; пузырь — по форме ролика, вертикальное уже.
 */
export function VideoAttachment({ attachment: a, messageId, sentAt, inAlbum, priority = !inAlbum, onOpen, onDoubleTap }: Props) {
  const item = mediaItem(a, { id: messageId });
  const [posterBroken, setPosterBroken] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  // Не загрузились ни обложка, ни сам ролик (нет доступа, удалён, нет сети) — плашка
  // «Повторить» вместо пустого чёрного прямоугольника и значка браузера «видео не открывается».
  const [frameFailed, setFrameFailed] = useState(false);
  const [bust, setBust] = useState("");
  const [mountedAt] = useState(() => Date.now());
  const sentMs = sentAt ? Date.parse(sentAt) : NaN;
  // Без даты нельзя надёжно определить возраст задания: не превращаем ролик в
  // вечный «обрабатывается», если старый клиент не прислал createdAt.
  const pending = !!a.previewPending && Number.isFinite(sentMs) && mountedAt - sentMs <= PENDING_MAX_MS;
  const retry = (e: MouseEvent) => {
    e.stopPropagation();
    setPosterBroken(false);
    setFrameFailed(false);
    setBust(Date.now().toString(36));
  };
  const [shape, setShape] = useState(a.width && a.height ? { w: a.width, h: a.height } : null);
  // После обработки сервер отдаёт совместимый MP4 в previewUrl. Старый код
  // пытался показать оригинальный HEVC/MOV из a.url, из-за чего на браузерах
  // и iPhone появлялась плашка «Не загрузилось», хотя превью уже было готово.
  const frameSrc = item.url;

  let style: CSSProperties | undefined;
  if (!inAlbum && shape) {
    style = { aspectRatio: `${shape.w} / ${shape.h}` };
    if (shape.h > shape.w) style = { ...style, ["--video-w" as string]: `${Math.round((VIDEO_MAX_H * shape.w) / shape.h)}px` };
  }
  const learnShape = (w: number, h: number) => {
    if (!shape && w > 0 && h > 0) setShape({ w, h });
  };

  return (
    <MediaTile className={inAlbum ? styles.albumTile : styles.videoTile} style={style} spoiler={!!a.spoiler} label={a.name || "Видео"} onOpen={onOpen} onDoubleTap={onDoubleTap}>
      {frameFailed ? (
        <span className={`${styles.failed} ${styles.videoFailed}`} role="button" tabIndex={0} onClick={retry}>
          <Icon name="RotateCw" size={22} />
          <span>{navigator.onLine === false ? "Нет сети" : "Не загрузилось"}</span>
          <span className={styles.failedHint}>Нажмите, чтобы повторить</span>
        </span>
      ) : item.thumbUrl && !posterBroken ? (
        <img
          key={bust}
          className={styles.poster}
          src={withBust(item.thumbUrl, bust)}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          style={frameReady ? undefined : { opacity: 0.01 }}
          onLoad={(e) => learnShape(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          onLoadCapture={() => setFrameReady(true)}
          // Обложка не загрузилась — берём первый кадр самого ролика.
          onError={() => setPosterBroken(true)}
        />
      ) : (
        <video
          key={bust}
          className={`${styles.poster} ${frameReady ? styles.frameReady : ""}`}
          src={frameSrc.includes("#") ? frameSrc : `${frameSrc.startsWith("blob:") ? frameSrc : withBust(frameSrc, bust)}#t=0.1`}
          poster={item.thumbUrl}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={(e) => {
            learnShape(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
            // Safari/мобильные WebView иногда оставляют video пустым после metadata.
            // Явно просим декодировать первый кадр, не начиная воспроизведение.
            try { e.currentTarget.currentTime = 0.1; } catch { /* кадр появится после загрузки */ }
          }}
          onLoadedData={() => setFrameReady(true)}
          onError={() => {
            setFrameFailed(true);
            notifyMediaError(a.name, "видео");
          }}
        />
      )}
      {frameFailed ? null : pending ? (
        <span className={styles.pendingSpinner} aria-label="Видео обрабатывается" />
      ) : (
        <span className={styles.play}>
          <Icon name="PlayFill" size={26} />
        </span>
      )}
      {a.durationSec && a.durationSec > 0 ? <span className={styles.duration}>{clockTime(a.durationSec)}</span> : null}
    </MediaTile>
  );
}
