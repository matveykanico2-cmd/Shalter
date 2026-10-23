import { useRef } from "react";

import { playExclusive } from "@/shared/lib/exclusive-media";
import { Icon } from "@/shared/ui";

import { clockTime } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";

import styles from "./attachments.module.css";
import { useMediaProgress } from "./use-media-progress";

const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Кружок (VideoNotePlayer в messageBubble.js): нажатие — пауза/воспроизведение, кольцо — сколько прошло. */
export function VideoNotePlayer({ attachment: a }: { attachment: Attachment }) {
  const video = useRef<HTMLVideoElement>(null);
  const { playing, current, duration } = useMediaProgress(video, a.durationSec ?? 0);
  const done = duration ? Math.min(1, current / duration) : 0;
  const started = current > 0 || playing;
  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      playExclusive(el);
      void el.play().catch(() => {});
    } else el.pause();
  };
  return (
    <button type="button" className={styles.videoNote} aria-label={playing ? "Пауза" : "Смотреть видеосообщение"} onClick={toggle}>
      {/* #t=0.001 — первый кадр виден ещё до нажатия, а не пустой круг. */}
      <video ref={video} className={styles.videoNoteVideo} src={`${a.url}#t=0.001`} poster={a.thumbUrl} playsInline preload="metadata" />
      <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} className={styles.ringTrack} />
        <circle cx="50" cy="50" r={RADIUS} className={styles.ringFill} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - done)} />
      </svg>
      {playing ? null : (
        <span className={styles.videoNoteOverlay}>
          <Icon name="Play" size={28} />
        </span>
      )}
      <span className={styles.videoNoteTime}>{started ? `${clockTime(current)} / ${clockTime(duration)}` : clockTime(duration)}</span>
    </button>
  );
}
