// Общий плеер голосовых, музыки и кружков — как public/js/lib/audioPlayer.js: играет одно,
// звук не обрывается при прокрутке и переходе в другой чат (голосовые и музыка — в
// <audio> вне страницы), после голосового сам запускается следующий, скорость общая.

export type NowPlayingInfo = {
  /** Чья это запись: «сообщение:url». */
  key: string;
  kind: "voice" | "audio" | "video-note";
  title: string;
  subtitle: string;
  chatId?: string;
  messageId?: string;
  durationSec?: number;
};

export type NowPlaying = NowPlayingInfo & { media: HTMLMediaElement };

const RATE_KEY = "shalter.playbackRate";
const POOL_MAX = 60;

const listeners = new Set<() => void>();
let current: NowPlaying | null = null;
let rate = readRate();
// Записи по ключу: смонтированный заново плеер берёт тот же элемент и видит, что он играет.
const pool = new Map<string, HTMLAudioElement>();

function readRate() {
  try {
    return Number(localStorage.getItem(RATE_KEY)) || 1;
  } catch {
    return 1;
  }
}

// Снимок для useSyncExternalStore: новый объект на каждое изменение (пауза, скорость).
let snapshot: { np: NowPlaying | null; rate: number; paused: boolean } = { np: null, rate, paused: true };
const emit = () => {
  snapshot = { np: current, rate, paused: current?.media.paused ?? true };
  listeners.forEach((fn) => fn());
};

/**
 * Голосовое или музыка — <audio> вне документа: его не ставит на паузу уход пузыря со страницы.
 * Музыка — preload="none", как в attachments.js: лента с треками не качает их заранее.
 */
export function audioFor(key: string, url: string, preload: "metadata" | "none" = "metadata") {
  let el = pool.get(key);
  if (!el) {
    el = new Audio();
    el.preload = preload;
    el.src = url;
    pool.set(key, el);
    if (pool.size > POOL_MAX) {
      for (const [k, media] of pool) {
        if (pool.size <= POOL_MAX) break;
        if (media !== current?.media) pool.delete(k);
      }
    }
  }
  return el;
}

const onChange = () => emit();
const onEnded = () => {
  const finished = current;
  if (!finished) return;
  detach();
  current = null;
  emit();
  // Следующее голосовое ниже в ленте — как в Telegram.
  if (finished.kind === "voice") nextVoiceButton(finished.key)?.click();
};

function nextVoiceButton(key: string) {
  const all = [...document.querySelectorAll<HTMLElement>("[data-voice-key]")];
  const i = all.findIndex((el) => el.dataset.voiceKey === key);
  return i >= 0 ? (all[i + 1]?.querySelector<HTMLButtonElement>("[data-voice-play]") ?? null) : null;
}

function detach() {
  if (!current) return;
  const m = current.media;
  m.removeEventListener("play", onChange);
  m.removeEventListener("pause", onChange);
  m.removeEventListener("ended", onEnded);
}

/** Запустить запись: прежняя встаёт на паузу. */
export function play(media: HTMLMediaElement, info: NowPlayingInfo) {
  if (current?.media !== media) {
    if (current && !current.media.paused) current.media.pause();
    detach();
    current = { ...info, media };
    media.addEventListener("play", onChange);
    media.addEventListener("pause", onChange);
    media.addEventListener("ended", onEnded);
  }
  media.playbackRate = rate;
  void media.play().catch(() => {});
  emit();
}

export const nowPlaying = {
  get: () => snapshot,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  toggle() {
    if (!current) return;
    if (current.media.paused) void current.media.play().catch(() => {});
    else current.media.pause();
  },
  stop() {
    if (!current) return;
    current.media.pause();
    try {
      current.media.currentTime = 0;
    } catch {
      // Ещё не загрузилась — не страшно.
    }
    detach();
    current = null;
    emit();
  },
  /** 1× → 1,5× → 2× → 1×, запоминается. */
  cycleRate() {
    rate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch {
      // Без хранилища — до перезагрузки.
    }
    if (current) current.media.playbackRate = rate;
    emit();
    return rate;
  },
};

/** Перемотать на seconds от текущего места (стрелки на осциллограмме). */
export function seekBy(media: HTMLMediaElement, seconds: number, duration: number) {
  media.currentTime = Math.max(0, Math.min(duration, media.currentTime + seconds));
}
