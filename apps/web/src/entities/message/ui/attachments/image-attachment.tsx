import { type MouseEvent, useEffect, useState } from "react";

import { Icon } from "@/shared/ui";

import { imageBox } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";

import styles from "./attachments.module.css";
import { MediaTile } from "./media-tile";

type Props = { attachment: Attachment; inAlbum?: boolean; onOpen?: () => void; onDoubleTap?: (at: { x: number; y: number }) => void };

/**
 * Фото с запасными адресами (resilientImage в attachments.js): сначала миниатюра, потом
 * оригинал; не отдался ни один — плашка «Повторить», а с возвращением сети — само.
 */
export function ImageAttachment({ attachment: a, inAlbum, onOpen, onDoubleTap }: Props) {
  const sources = [...new Set([a.thumbUrl, a.url].filter((u): u is string => !!u))];
  const [attempt, setAttempt] = useState({ index: 0, bust: "" });
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const failed = attempt.index >= sources.length;

  const retry = (e?: MouseEvent) => {
    e?.stopPropagation();
    setLoaded(false);
    setAttempt({ index: 0, bust: Date.now().toString(36) });
  };
  useEffect(() => {
    if (!failed) return;
    const onOnline = () => setAttempt({ index: 0, bust: Date.now().toString(36) });
    window.addEventListener("online", onOnline, { once: true });
    return () => window.removeEventListener("online", onOnline);
  }, [failed]);

  // Размер заранее — лента не прыгает, пока фото грузится, а пузырь не шире картинки.
  // Сервер размеры не всегда присылает — тогда по самой картинке, когда загрузится.
  const box = inAlbum ? null : (imageBox(a) ?? (natural && imageBox(natural)));
  const src = sources[attempt.index];
  const url = src && attempt.bust ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt.bust}` : src;

  return (
    <MediaTile className={inAlbum ? styles.albumTile : styles.imageTile} spoiler={!!a.spoiler} label={a.name || "Фото"} onOpen={onOpen} onDoubleTap={onDoubleTap}>
      {failed ? (
        <span className={styles.failed} role="button" tabIndex={0} onClick={retry}>
          <Icon name="RotateCw" size={22} />
          <span>{navigator.onLine === false ? "Нет сети" : "Не загрузилось"}</span>
          <span className={styles.failedHint}>Нажмите, чтобы повторить</span>
        </span>
      ) : (
        <img
          key={url}
          className={loaded ? styles.image : `${styles.image} ${styles.loading}`}
          src={url}
          alt={a.name || "photo"}
          loading="lazy"
          decoding="async"
          style={box ?? undefined}
          onLoad={(e) => {
            setLoaded(true);
            setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
          }}
          onError={() => setAttempt((s) => ({ ...s, index: s.index + 1 }))}
        />
      )}
    </MediaTile>
  );
}
