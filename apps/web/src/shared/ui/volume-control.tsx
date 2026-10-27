import { type CSSProperties, useRef, useSyncExternalStore } from "react";

import { getVolume, setVolume, subscribeVolume } from "../lib/media/media-volume";

import { Icon } from "./icon";
import styles from "./volume-control.module.css";

/** Громкость звонка — как public/js/components/volumeControl.js: кнопка без звука и ползунок. */
export function VolumeControl({ className }: { className?: string }) {
  const volume = useSyncExternalStore(subscribeVolume, getVolume);
  // Куда вернуть звук после «Выключить звук».
  const lastNonZero = useRef(getVolume() || 1);
  const percent = Math.round(volume * 100);
  return (
    <div className={[styles.control, volume === 0 ? styles.muted : "", className ?? ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={styles.button}
        title={volume > 0 ? "Выключить звук" : "Вернуть звук"}
        onClick={() => {
          if (volume > 0) lastNonZero.current = volume;
          setVolume(volume > 0 ? 0 : lastNonZero.current);
        }}
      >
        <Icon name={volume > 0 ? "Volume" : "VolumeOff"} size={18} />
      </button>
      <input
        type="range"
        className={styles.slider}
        min={0}
        max={100}
        step={1}
        value={percent}
        title="Громкость"
        aria-label="Громкость"
        style={{ "--volume-fill": `${percent}%` } as CSSProperties}
        onChange={(e) => {
          const next = Number(e.target.value) / 100;
          if (next > 0) lastNonZero.current = next;
          setVolume(next);
        }}
      />
      <span className={styles.value}>{percent}%</span>
    </div>
  );
}
