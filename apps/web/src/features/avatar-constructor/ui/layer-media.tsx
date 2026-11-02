import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";

import { mountLottie, stickerFormat } from "../lib/animated-source";

import styles from "./avatar-constructor.module.css";

type Props = {
  url: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  lazy?: boolean;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
};

/** Слой или плитка стикера: картинка, проигрывающийся lottie (.tgs/.json/.lottie) или беззвучное видео (.webm/.mp4). */
export function LayerMedia({ url, alt = "", className, style, lazy = false, onPointerDown }: Props) {
  const format = stickerFormat(url);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (format !== "lottie" || !boxRef.current) return;
    return mountLottie(boxRef.current, url);
  }, [format, url]);

  if (format === "video")
    return <video src={url} className={className} style={{ objectFit: "contain", ...style }} autoPlay loop muted playsInline aria-label={alt || undefined} onPointerDown={onPointerDown} />;
  if (format === "lottie")
    return <span ref={boxRef} role="img" aria-label={alt || "Анимированный стикер"} className={className ? `${className} ${styles.lottie}` : styles.lottie} style={style} onPointerDown={onPointerDown} />;
  return <img src={url} alt={alt} loading={lazy ? "lazy" : undefined} draggable={false} className={className} style={style} onPointerDown={onPointerDown} />;
}
