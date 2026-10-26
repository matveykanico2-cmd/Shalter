import { useEffect, useRef } from "react";

import { applyVolume, subscribeVolume } from "../lib/media/media-volume";

type Props = { stream: MediaStream | null; className?: string };

/** Видео потока звонка или эфира — без звука: звук играет StreamAudio рядом. */
export function StreamVideo({ stream, className, ref }: Props & { ref?: (el: HTMLVideoElement | null) => void }) {
  const el = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream;
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
