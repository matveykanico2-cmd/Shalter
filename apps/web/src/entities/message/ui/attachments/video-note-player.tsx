import { useRef } from "react";

import { play } from "@/shared/lib/media/now-playing";
import { Icon } from "@/shared/ui";

import { clockTime } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import styles from "./attachments.module.css";
import { useMediaProgress } from "./use-media-progress";

const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Кружок (VideoNotePlayer в messageBubble.js): нажатие — пауза/воспроизведение, кольцо — сколько прошло. */
export function VideoNotePlayer({ attachment: a, message, senderName }: { attachment: Attachment; message: FeedMessage; senderName: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const { playing, current, duration, failed } = useMediaProgress(video, a.durationSec ?? 0);
  const done = duration ? Math.min(1, current / duration) : 0;
  const started = current > 0 || playing;
  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    // Не загрузился (нет доступа, нет сети) — запрашиваем заново.
    if (el.error) el.load();
    play(el, {
      key: `${message.id}:${a.url}`,
      kind: "video-note",
      title: senderName ?? "Видеосообщение",
      subtitle: "Видеосообщение",
      chatId: message.chatId,
      messageId: message.id,
      durationSec: a.durationSec,
    });
  };
  return (
    <button
      type="button"
      className={styles.videoNote}
      aria-label={failed ? "Повторить загрузку видеосообщения" : playing ? "Пауза" : "Смотреть видеосообщение"}
      onClick={toggle}
    >
      {/* #t=0.001 — первый кадр виден ещё до нажатия, а не пустой круг. Не загрузился — прячем:
          иначе Safari рисует на месте ролика свой значок «видео не открывается». */}
      <video ref={video} className={styles.videoNoteVideo} src={`${a.url}#t=0.001`} poster={a.thumbUrl} playsInline preload="metadata" hidden={failed} />
      <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} className={styles.ringTrack} />
        <circle cx="50" cy="50" r={RADIUS} className={styles.ringFill} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - done)} />
      </svg>
      {failed ? (
        <span className={`${styles.videoNoteOverlay} ${styles.videoNoteFailed}`}>
          <Icon name="RotateCw" size={24} />
          <span>Не загрузилось</span>
        </span>
      ) : playing ? null : (
        <span className={styles.videoNoteOverlay}>
          <Icon name="Play" size={28} />
        </span>
      )}
      {failed ? null : <span className={styles.videoNoteTime}>{started ? `${clockTime(current)} / ${clockTime(duration)}` : clockTime(duration)}</span>}
    </button>
  );
}
