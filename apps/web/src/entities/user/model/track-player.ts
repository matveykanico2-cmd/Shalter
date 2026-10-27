import { useSyncExternalStore } from "react";

// Музыка профиля играет одна на всё приложение — общий <audio>, новая ▶ останавливает
// прежнюю (как в public/js/components/profileTracks.js).
let audio: HTMLAudioElement | null = null;
let playingUrl: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((fn) => fn());
};

function player() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "none";
  for (const ev of ["play", "pause", "timeupdate", "loadedmetadata"]) audio.addEventListener(ev, notify);
  audio.addEventListener("ended", () => {
    playingUrl = null;
    notify();
  });
  return audio;
}

export const trackPlayer = {
  toggle(url: string) {
    const a = player();
    if (playingUrl === url && !a.paused) return a.pause();
    if (playingUrl !== url) {
      a.src = url;
      playingUrl = url;
    }
    a.play().catch(() => {});
  },
  isPlaying: (url: string) => playingUrl === url && !!audio && !audio.paused,
  /** Время и длительность играющего трека или null, если играет другой. */
  progress: (url: string) => (playingUrl === url && audio && Number.isFinite(audio.duration) ? { current: audio.currentTime, duration: audio.duration } : null),
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Перерисовка по событиям плеера. */
export const useTrackPlayer = () => useSyncExternalStore(subscribe, () => version);
