import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { seekBy } from "@/shared/lib/media/now-playing";
import { Icon } from "@/shared/ui";

import { clockTime, resampleWaveform } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import styles from "./attachments.module.css";
import { useDecodedWaveform } from "./use-decoded-waveform";
import { useSeek } from "./use-media-progress";
import { usePlayer } from "./use-player";

const BARS = 40;

/**
 * Голосовое как в Telegram (VoicePlayer в messageBubble.js): круглая кнопка,
 * осциллограмма с перемоткой, длительность и кнопка расшифровки.
 */
export function VoicePlayer({ attachment: a, message, senderName }: { attachment: Attachment; message: FeedMessage; senderName: string | null }) {
  const { key, ref: audio, toggle, playing, current, duration, failed } = usePlayer(message, a, "voice", senderName);
  const seek = useSeek(audio, duration);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const waveRef = useRef<HTMLSpanElement>(null);
  // Старое голосовое без сохранённой осциллограммы — считаем её из файла, когда видно.
  const decoded = useDecodedWaveform(waveRef, a.url, !a.waveform?.length);
  const levels = a.waveform?.length ? a.waveform : decoded;
  const bars = useMemo(() => (levels?.length ? resampleWaveform(levels, BARS) : new Array<number>(BARS).fill(0)), [levels]);
  const done = duration ? Math.min(1, current / duration) : 0;
  const lit = Math.round(done * BARS);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    if (duration) seekBy(audio.current, e.key === "ArrowLeft" ? -5 : 5, duration);
  };

  return (
    <div className={styles.voiceBlock}>
      <div className={styles.voice} data-voice-key={key}>
        <button
          type="button"
          data-voice-play=""
          className={playing ? `${styles.voicePlay} ${styles.playing}` : styles.voicePlay}
          aria-label={failed ? "Повторить загрузку" : playing ? "Пауза" : "Слушать"}
          onClick={toggle}
        >
          <Icon name={failed ? "RotateCw" : playing ? "PauseFill" : "PlayFill"} size={24} />
        </button>
        <span className={styles.voiceBody}>
          <span
            ref={waveRef}
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
          <span className={styles.voiceTime}>{failed ? "Не загрузилось — нажмите, чтобы повторить" : current > 0 ? clockTime(current) : clockTime(duration)}</span>
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
