import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";

import { nowPlaying } from "../lib/media/now-playing";

import { Icon } from "./icon";
import styles from "./now-playing-bar.module.css";

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** «Сейчас играет» — полоской над всем приложением (AudioPlayerBar в public/js/components/audioPlayerBar.js, .shell-media-bar). */
export function NowPlayingBar() {
  const { np, rate, paused } = useSyncExternalStore(nowPlaying.subscribe, nowPlaying.get);
  const navigate = useNavigate();
  const fill = useRef<HTMLSpanElement>(null);
  const [time, setTime] = useState("");
  const media = np?.media ?? null;
  const known = np?.durationSec ?? 0;

  // Полоса и таймер — каждым кадром, пока играет.
  useEffect(() => {
    if (!media) return;
    let raf = 0;
    const tick = () => {
      // У записей из браузера (WebM) длительность файла неизвестна — берём из сообщения.
      const dur = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : known;
      if (fill.current) fill.current.style.transform = `scaleX(${dur ? Math.min(1, media.currentTime / dur) : 0})`;
      setTime(dur ? `${clock(media.currentTime)} / ${clock(dur)}` : clock(media.currentTime));
      if (!media.paused) raf = requestAnimationFrame(tick);
    };
    tick();
    const restart = () => {
      cancelAnimationFrame(raf);
      tick();
    };
    media.addEventListener("play", restart);
    media.addEventListener("seeked", restart);
    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener("play", restart);
      media.removeEventListener("seeked", restart);
    };
  }, [media, known]);

  if (!np || !media) return null;
  const playing = !paused;
  return (
    <div className={styles.slot}>
      <div className={styles.bar} role="region" aria-label="Сейчас играет">
        <button type="button" className={styles.toggle} title={playing ? "Пауза" : "Слушать"} onClick={() => nowPlaying.toggle()}>
          <Icon name={playing ? "PauseFill" : "PlayFill"} size={20} />
        </button>
        <button
          type="button"
          className={styles.info}
          title="Перейти к сообщению"
          onClick={() => np.chatId && np.messageId && void navigate(`/chat/${np.chatId}?msg=${encodeURIComponent(np.messageId)}`)}
        >
          <span className={styles.title}>{np.title || "Аудио"}</span>
          <span className={styles.subtitle}>
            <span>{np.subtitle}</span>
            <span className={styles.time}>{time}</span>
          </span>
        </button>
        <button type="button" className={styles.rate} title="Скорость воспроизведения" onClick={() => nowPlaying.cycleRate()}>
          {rate}×
        </button>
        <button type="button" className={styles.toggle} title="Закрыть" onClick={() => nowPlaying.stop()}>
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className={styles.progress}>
        <span ref={fill} className={styles.fill} />
      </div>
    </div>
  );
}
