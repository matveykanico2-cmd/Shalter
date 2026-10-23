import { type RefObject, useEffect, useRef, useState } from "react";

import { createLevelMeter, type Recorded, type Recording, type RecordMode, startRecording } from "@/shared/lib/media/recorder";
import { startTranscription } from "@/shared/lib/media/speech";
import { packWaveform } from "@/shared/lib/media/waveform";
import { Icon } from "@/shared/ui";

import { sendTyping } from "../api/send-message";

import styles from "./recording.module.css";

// Как composer.js: потянуть влево — отмена, вверх — закрепить; слишком короткое не уходит.
const HOLD_CANCEL_PX = 110;
const HOLD_LOCK_PX = 80;
const HOLD_MIN_MS = 400;
const ACTION_PING_MS = 2500;
const WAVE_BAR_PX = 6;

/** Управление удержанием: кнопка записи держит палец и передаёт его движения сюда. */
export type HoldControl = { move: (dx: number, dy: number) => void; release: () => void; lock: () => void };

export type RecordingDone = { recorded: Recorded; waveform?: number[]; transcript?: string };

type Props = {
  chatId: string;
  mode: RecordMode;
  hold: boolean;
  transcribe: boolean;
  holdControlRef: RefObject<HoldControl | null>;
  onDone: (result: RecordingDone) => void;
  onCancel: () => void;
  onError: (text: string) => void;
  /** Палец отпущен или запись закреплена — кнопка записи больше не нужна. */
  onHoldEnd?: () => void;
};

/**
 * Запись голосового или кружка — beginRecording в public/js/components/composer.js:
 * удалить, осциллограмма в реальном времени, таймер с сотыми, пауза, отправить.
 */
export function RecordingBar({ chatId, mode, hold, transcribe, holdControlRef, onDone, onCancel, onError, onHoldEnd }: Props) {
  const [handle, setHandle] = useState<Recording | null>(null);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(hold);
  const [hint, setHint] = useState("");
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const wave = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const slide = useRef<HTMLSpanElement>(null);
  const lock = useRef<HTMLDivElement>(null);
  const clock = useRef({ startedAt: 0, pausedAt: null as number | null });
  const recordedLevels = useRef<number[]>([]);
  const finishing = useRef(false);
  const callbacks = useRef({ onDone, onCancel, onError, onHoldEnd });
  useEffect(() => {
    callbacks.current = { onDone, onCancel, onError, onHoldEnd };
  });
  useEffect(() => {
    if (!holding) callbacks.current.onHoldEnd?.();
  }, [holding]);

  const elapsed = () => (clock.current.pausedAt ?? Date.now()) - clock.current.startedAt;
  const flash = (text: string) => {
    setHint(text);
    setTimeout(() => setHint((h) => (h === text ? "" : h)), 3000);
  };

  // Запуск: микрофон (и камера), «записывает…» у собеседника, расшифровка, осциллограмма.
  useEffect(() => {
    let cancelled = false;
    let rec: Recording | null = null;
    let raf = 0;
    let meter: ReturnType<typeof createLevelMeter> = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    const transcription = mode === "voice" && transcribe ? startTranscription() : null;
    const action = mode === "voice" ? "record_voice" : "record_video_note";

    startRecording(mode)
      .then((r) => {
        if (cancelled) return r.cancel();
        rec = r;
        clock.current = { startedAt: Date.now(), pausedAt: null };
        setHandle(r);
        if (r.previewStream) setPreview(r.previewStream);
        sendTyping(chatId, action).catch(() => {});
        ping = setInterval(() => sendTyping(chatId, action).catch(() => {}), ACTION_PING_MS);

        meter = createLevelMeter(r.stream);
        const levels: number[] = [];
        const step = () => {
          if (!r.isPaused()) {
            const el = wave.current;
            if (el && meter) {
              const level = meter.level();
              if (mode === "voice") recordedLevels.current.push(level);
              const count = Math.max(24, Math.min(400, Math.floor((el.clientWidth || 260) / WAVE_BAR_PX)));
              levels.push(level);
              while (levels.length > count) levels.shift();
              if (el.childElementCount !== count) el.replaceChildren(...Array.from({ length: count }, () => Object.assign(document.createElement("span"), { className: styles.waveBar })));
              const bars = el.children;
              for (let i = 0; i < count; i++) (bars[i] as HTMLElement).style.height = `${Math.max(14, Math.round((levels[i - (count - levels.length)] ?? 0.06) * 100))}%`;
            }
          }
          if (time.current) time.current.textContent = clockLabel(elapsed());
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);

        void r.result.then(async (recorded) => {
          cancelAnimationFrame(raf);
          meter?.close();
          clearInterval(ping);
          sendTyping(chatId, "cancel").catch(() => {});
          if (!recorded || cancelled) {
            transcription?.cancel();
            if (!cancelled) callbacks.current.onCancel();
            return;
          }
          const transcript = (await transcription?.stop()) || undefined;
          callbacks.current.onDone({ recorded, waveform: mode === "voice" ? packWaveform(recordedLevels.current) : undefined, transcript });
        });
      })
      .catch(() => {
        if (cancelled) return;
        transcription?.cancel();
        callbacks.current.onError("Нет доступа к микрофону или камере");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      meter?.close();
      clearInterval(ping);
      transcription?.cancel();
      // Ушли с экрана посреди записи — не отправляем.
      if (rec && !finishing.current) rec.cancel();
    };
  }, [chatId, mode, transcribe]);

  const finish = () => {
    if (!handle) return;
    finishing.current = true;
    setHolding(false);
    handle.stop();
  };
  const cancel = () => {
    setHolding(false);
    if (handle) handle.cancel();
    else onCancel();
  };
  const togglePause = () => {
    if (!handle) return;
    const wasPaused = handle.isPaused();
    if (!(wasPaused ? handle.resume() : handle.pause())) return;
    if (wasPaused) {
      clock.current.startedAt += Date.now() - (clock.current.pausedAt ?? Date.now());
      clock.current.pausedAt = null;
    } else clock.current.pausedAt = Date.now();
    setPaused(!wasPaused);
  };

  // Палец на кнопке записи: влево — отмена, вверх — закрепить, отпустил — отправить.
  useEffect(() => {
    if (!holding) {
      holdControlRef.current = null;
      return;
    }
    holdControlRef.current = {
      move: (dx, dy) => {
        if (dx < -HOLD_CANCEL_PX) return cancel();
        if (dy < -HOLD_LOCK_PX) {
          setHolding(false);
          flash("Запись закреплена");
          return;
        }
        if (slide.current) {
          const left = Math.min(0, dx);
          slide.current.style.transform = `translateX(${left}px)`;
          slide.current.style.opacity = String(1 - (0.7 * -left) / HOLD_CANCEL_PX);
        }
        if (lock.current) lock.current.style.transform = `translateY(${Math.min(0, dy)}px)`;
      },
      release: () => {
        setHolding(false);
        if (!handle || elapsed() < HOLD_MIN_MS) {
          if (handle) flash("Слишком коротко — удерживайте дольше");
          return;
        }
        finish();
      },
      lock: () => {
        setHolding(false);
        flash("Запись закреплена");
      },
    };
    return () => {
      holdControlRef.current = null;
    };
  });

  return (
    <div className={[styles.bar, paused ? styles.paused : "", holding ? styles.holding : ""].filter(Boolean).join(" ")} role="group" aria-label={mode === "voice" ? "Запись голосового" : "Запись видеосообщения"}>
      {mode === "video-note" && preview ? <RoundPreview stream={preview} onFlip={async () => {
        const res = await handle?.flipCamera?.();
        if (res?.error) flash(res.error);
      }} /> : null}
      <button type="button" className={`${styles.iconButton} ${styles.danger}`} title="Удалить" onClick={cancel}>
        <Icon name="Trash" size={17} />
      </button>
      {holding ? (
        <span ref={slide} className={styles.slide}>
          ← Отмена
        </span>
      ) : null}
      <span className={styles.dot} />
      <div ref={wave} className={styles.wave} aria-hidden="true" />
      <span ref={time} className={styles.time}>
        0:00,00
      </span>
      {hint ? (
        <span className={styles.hint} role="status">
          {hint}
        </span>
      ) : null}
      <button type="button" className={styles.iconButton} title={paused ? "Продолжить" : "Пауза"} disabled={!handle} onClick={togglePause}>
        <Icon name={paused ? "PlayFill" : "PauseFill"} size={18} />
      </button>
      <button type="button" className={styles.send} title="Отправить" disabled={!handle} onClick={finish}>
        <Icon name="Send" size={17} />
      </button>
      {holding ? (
        <div ref={lock} className={styles.lock} title="Потяните вверх, чтобы закрепить">
          <Icon name="Lock" size={16} />
          <span>↑</span>
        </div>
      ) : null}
    </div>
  );
}

function RoundPreview({ stream, onFlip }: { stream: MediaStream; onFlip: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.srcObject = stream;
    // autoplay с камеры Android WebView соблюдает не всегда — запускаем сами; до первого
    // кадра прячем, иначе виден чёрный круг.
    el.play()
      .catch(() => {})
      .finally(() => setReady(true));
  }, [stream]);
  return (
    <div className={styles.round}>
      <div className={styles.roundWrap}>
        <video ref={video} className={ready ? styles.roundVideo : `${styles.roundVideo} ${styles.preparing}`} autoPlay muted playsInline />
        <button type="button" className={styles.flip} title="Другая камера" onClick={onFlip}>
          <Icon name="RotateCw" size={18} />
        </button>
      </div>
    </div>
  );
}

function clockLabel(ms: number) {
  const mm = Math.floor(ms / 60000);
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${mm}:${ss},${cs}`;
}
