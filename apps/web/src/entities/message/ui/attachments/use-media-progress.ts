import { type RefObject, useEffect, useState } from "react";

/**
 * Играет ли и сколько прошло — для кнопки, полоски и таймера плеера. failed — файл не
 * загрузился (нет доступа, удалён, нет сети): плеер показывает «Повторить», а не вечную кнопку.
 */
export function useMediaProgress(ref: RefObject<HTMLMediaElement | null>, knownDuration = 0) {
  const [state, setState] = useState({ playing: false, current: 0, duration: knownDuration, failed: false });
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    const sync = () =>
      setState({
        playing: !media.paused && !media.ended,
        current: media.ended ? 0 : media.currentTime,
        duration: knownDuration > 0 ? knownDuration : Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0,
        failed: !!media.error,
      });
    const events = ["play", "pause", "ended", "timeupdate", "seeking", "loadedmetadata", "error", "loadstart"] as const;
    for (const ev of events) media.addEventListener(ev, sync);
    // Плеер смонтировали заново, а запись уже играет (общий плеер) или уже не загрузилась — сразу её состояние.
    if (!media.paused || media.currentTime > 0 || media.error) sync();
    return () => {
      for (const ev of events) media.removeEventListener(ev, sync);
    };
  }, [ref, knownDuration]);
  return state;
}

/** Перемотка по полосе: нажатие — прыжок, перетаскивание — плавно. */
export function useSeek(ref: RefObject<HTMLMediaElement | null>, duration: number) {
  const seek = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!el || !rect.width || !duration) return;
    el.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      seek(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) seek(e);
    },
  };
}
