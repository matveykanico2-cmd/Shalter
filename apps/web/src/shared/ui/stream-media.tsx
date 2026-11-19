import { useEffect, useRef } from "react";

import { applyVolume, subscribeVolume } from "../lib/media/media-volume";

type Props = { stream: MediaStream | null; className?: string };

/** Видео потока звонка или эфира — без звука: звук играет StreamAudio рядом. */
export function StreamVideo({ stream, className, ref }: Props & { ref?: (el: HTMLVideoElement | null) => void }) {
  const el = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const attachAndPlay = () => {
      if (!stream) return;
      // Safari/WebKit can keep a MediaStream object alive while detaching it
      // from the video element after backgrounding or route changes.
      if (node.srcObject !== stream) node.srcObject = stream;
      void Promise.resolve(node.play?.()).catch(() => {});
    };
    attachAndPlay();
    const onVisibility = () => {
      if (document.visibilityState === "visible") attachAndPlay();
    };
    const onPageShow = () => attachAndPlay();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [stream]);
  return (
    <video
      ref={(node) => {
        el.current = node;
        ref?.(node);
      }}
      className={className}
      autoPlay
      playsInline
      muted
      // У MediaStream нет скачивания: этот атрибут только убирает попытку
      // WebView показать пустой загрузочный кадр перед первым фреймом.
      preload="none"
    />
  );
}

/** Звук собеседника с общей громкостью звонков и эфиров. */
export function StreamAudio({ stream }: { stream: MediaStream }) {
  const el = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (node.srcObject !== stream) node.srcObject = stream;
    applyVolume(node);
    return subscribeVolume(() => applyVolume(node));
  }, [stream]);
  return <audio ref={el} autoPlay />;
}
