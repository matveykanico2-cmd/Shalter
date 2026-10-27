import { type CSSProperties, type MouseEvent, useState } from "react";

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
  onOpen?: () => void;
  onDoubleTap?: (at: { x: number; y: number }) => void;
};

const withBust = (url: string, bust: string) => (bust ? `${url}${url.includes("?") ? "&" : "?"}r=${bust}` : url);

/**
 * Видео — VideoAttachment из attachments.js: обложка (или первый кадр самого ролика),
 * кнопка Play, длительность; пузырь — по форме ролика, вертикальное уже.
 */
export function VideoAttachment({ attachment: a, messageId, sentAt, inAlbum, onOpen, onDoubleTap }: Props) {
  const item = mediaItem(a, { id: messageId });
  const [posterBroken, setPosterBroken] = useState(false);
  // Не загрузились ни обложка, ни сам ролик (нет доступа, удалён, нет сети) — плашка
  // «Повторить» вместо пустого чёрного прямоугольника и значка браузера «видео не открывается».
  const [frameFailed, setFrameFailed] = useState(false);
  const [bust, setBust] = useState("");
  const [mountedAt] = useState(() => Date.now());
  const sentMs = sentAt ? Date.parse(sentAt) : NaN;
  const pending = !!a.previewPending && !(mountedAt - sentMs > PENDING_MAX_MS);
  const retry = (e: MouseEvent) => {
    e.stopPropagation();
    setPosterBroken(false);
    setFrameFailed(false);
    setBust(Date.now().toString(36));
  };
  const [shape, setShape] = useState(a.width && a.height ? { w: a.width, h: a.height } : null);
  const frameSrc = a.thumbUrl?.startsWith("blob:") ? a.thumbUrl : a.url!;

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
          loading="lazy"
          decoding="async"
          onLoad={(e) => learnShape(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          // Обложка не загрузилась — берём первый кадр самого ролика.
          onError={() => setPosterBroken(true)}
        />
      ) : (
        <video
          key={bust}
          className={styles.poster}
          src={frameSrc.includes("#") ? frameSrc : `${frameSrc.startsWith("blob:") ? frameSrc : withBust(frameSrc, bust)}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={(e) => learnShape(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          onError={() => setFrameFailed(true)}
        />
      )}
      {frameFailed ? null : pending ? (
        <span className={styles.pendingSpinner} aria-label="Видео обрабатывается" />
      ) : (
        <span className={styles.play}>
          <Icon name="Play" size={28} />
        </span>
      )}
      {a.durationSec && a.durationSec > 0 ? <span className={styles.duration}>{clockTime(a.durationSec)}</span> : null}
    </MediaTile>
  );
}
