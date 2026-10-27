import { type CSSProperties, useState } from "react";

import { Icon } from "@/shared/ui";

import { clockTime, mediaItem } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";

import styles from "./attachments.module.css";
import { MediaTile } from "./media-tile";

const VIDEO_MAX_H = 420;

type Props = { attachment: Attachment; messageId: string; inAlbum?: boolean; onOpen?: () => void; onDoubleTap?: (at: { x: number; y: number }) => void };

/**
 * Видео — VideoAttachment из attachments.js: обложка (или первый кадр самого ролика),
 * кнопка Play, длительность; пузырь — по форме ролика, вертикальное уже.
 */
export function VideoAttachment({ attachment: a, messageId, inAlbum, onOpen, onDoubleTap }: Props) {
  const item = mediaItem(a, { id: messageId });
  const [posterBroken, setPosterBroken] = useState(false);
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
      {item.thumbUrl && !posterBroken ? (
        <img
          className={styles.poster}
          src={item.thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={(e) => learnShape(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          // Обложка не загрузилась — берём первый кадр самого ролика.
          onError={() => setPosterBroken(true)}
        />
      ) : (
        <video
          className={styles.poster}
          src={frameSrc.includes("#") ? frameSrc : `${frameSrc}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={(e) => learnShape(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
        />
      )}
      {a.previewPending ? (
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
