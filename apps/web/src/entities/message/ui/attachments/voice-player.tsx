import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { playExclusive } from "@/shared/lib/exclusive-media";
import { Icon } from "@/shared/ui";

import { clockTime, resampleWaveform } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";

import styles from "./attachments.module.css";
import { useMediaProgress, useSeek } from "./use-media-progress";

const BARS = 40;

/**
 * Голосовое как в Telegram (VoicePlayer в messageBubble.js): круглая кнопка,
 * осциллограмма с перемоткой, длительность и кнопка расшифровки.
 */
export function VoicePlayer({ attachment: a }: { attachment: Attachment }) {
  const audio = useRef<HTMLAudioElement>(null);
  const { playing, current, duration } = useMediaProgress(audio, a.durationSec ?? 0);
  const seek = useSeek(audio, duration);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const bars = useMemo(() => (a.waveform?.length ? resampleWaveform(a.waveform, BARS) : new Array<number>(BARS).fill(0)), [a.waveform]);
  const done = duration ? Math.min(1, current / duration) : 0;
  const lit = Math.round(done * BARS);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      playExclusive(el);
      void el.play().catch(() => {});
    } else el.pause();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const el = audio.current;
    if (el && duration) el.currentTime = Math.max(0, Math.min(duration, el.currentTime + (e.key === "ArrowLeft" ? -5 : 5)));
  };

  return (
    <div className={styles.voiceBlock}>
      <div className={styles.voice}>
        <audio ref={audio} src={a.url} preload="metadata" />
        <button type="button" className={playing ? `${styles.voicePlay} ${styles.playing}` : styles.voicePlay} aria-label={playing ? "Пауза" : "Слушать"} onClick={toggle}>
          <Icon name={playing ? "PauseFill" : "PlayFill"} size={24} />
        </button>
        <span className={styles.voiceBody}>
          <span
            className={styles.wave}
            role="slider"
            tabIndex={0}
            aria-label="Перемотка"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(done * 100)}
            onKeyDown={onKey}
            {...seek}
          >
            {bars.map((v, i) => (
              <span key={i} className={i < lit ? `${styles.bar} ${styles.played}` : styles.bar} style={{ ["--h" as string]: Math.max(0.12, v).toFixed(3) }} />
            ))}
          </span>
          <span className={styles.voiceTime}>{current > 0 ? clockTime(current) : clockTime(duration)}</span>
        </span>
        {a.transcript ? (
          <button
            type="button"
            className={transcriptOpen ? `${styles.transcribe} ${styles.transcribeOpen}` : styles.transcribe}
            title="Расшифровка"
            aria-expanded={transcriptOpen}
            onClick={(e) => {
              e.stopPropagation();
              setTranscriptOpen((v) => !v);
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h6M6.5 9 9 12l-2.5 3" />
              <path d="m12 18 4-11 4 11M13.4 14.5h5.2" />
            </svg>
          </button>
        ) : null}
      </div>
      {a.transcript && transcriptOpen ? <div className={styles.transcript}>{a.transcript}</div> : null}
    </div>
  );
}
