import { type KeyboardEvent, useState } from "react";

import { Dialog, Icon } from "@/shared/ui";

import { trackPlayer, useTrackPlayer } from "../model/track-player";

import styles from "./profile-track-card.module.css";

export type ProfileTrack = { url: string; name?: string; duration?: number };

const asTracks = (tracks: readonly unknown[] | null | undefined) =>
  (tracks ?? []).filter((t): t is ProfileTrack => !!t && typeof t === "object" && typeof (t as ProfileTrack).url === "string");

const trackTitle = (t: ProfileTrack) => String(t.name || "Трек").replace(/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i, "");

function fmtTime(sec: number | undefined) {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeLabel(t: ProfileTrack) {
  const p = trackPlayer.progress(t.url);
  return p ? `${fmtTime(p.current) || "0:00"} / ${fmtTime(p.duration)}` : fmtTime(t.duration);
}

function PlayButton({ track, size = 40 }: { track: ProfileTrack; size?: number }) {
  const playing = trackPlayer.isPlaying(track.url);
  return (
    <button
      type="button"
      className={playing ? `${styles.play} ${styles.playing}` : styles.play}
      style={{ width: size, height: size }}
      title="Слушать"
      aria-label="Слушать"
      onClick={(e) => {
        e.stopPropagation();
        trackPlayer.toggle(track.url);
      }}
    >
      <Icon name={playing ? "Pause" : "Play"} size={Math.round(size * 0.45)} />
    </button>
  );
}

/**
 * Музыка профиля, как в Telegram (ProfileTrackCard в public/js/components/profileTracks.js):
 * карточка основного трека (▶, название, прогресс, «ещё N»), по нажатию — список всех.
 */
export function ProfileTrackCard({ tracks }: { tracks: readonly unknown[] | null | undefined }) {
  useTrackPlayer();
  const [sheet, setSheet] = useState(false);
  const list = asTracks(tracks);
  const main = list[0];
  if (!main) return null;
  const p = trackPlayer.progress(main.url);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    setSheet(true);
  };
  return (
    <>
      <div className={styles.card} role="button" tabIndex={0} title={list.length > 1 ? "Все треки" : "Трек"} onClick={() => setSheet(true)} onKeyDown={onKeyDown}>
        <PlayButton track={main} />
        <div className={styles.body}>
          <p className={styles.name}>
            <span className={styles.nameIcon}>
              <Icon name="Volume" size={13} />
            </span>
            <span className={styles.nameText}>{trackTitle(main)}</span>
          </p>
          <div className={styles.meta}>
            <span className={styles.progress}>
              <span className={styles.fill} style={{ width: `${p ? Math.min(100, (p.current / p.duration) * 100) : 0}%` }} />
            </span>
            <span className={styles.time}>{timeLabel(main)}</span>
          </div>
        </div>
        {list.length > 1 ? (
          <span className={styles.more}>ещё {list.length - 1}</span>
        ) : (
          <span className={styles.chevron}>
            <Icon name="ChevronRight" size={16} />
          </span>
        )}
      </div>
      {sheet ? <TracksSheet tracks={list} onClose={() => setSheet(false)} /> : null}
    </>
  );
}

/** Все треки профиля (openTracksSheet): первый — «основной». */
function TracksSheet({ tracks, onClose }: { tracks: ProfileTrack[]; onClose: () => void }) {
  // Закрыли окно — музыка играет дальше, как в старом клиенте.
  useTrackPlayer();
  return (
    <Dialog title={tracks.length > 1 ? `Треки · ${tracks.length}` : "Трек"} onClose={onClose} className={styles.sheet}>
      <button type="button" className={styles.close} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
        <Icon name="X" size={20} />
      </button>
      <div className={styles.list}>
        {tracks.map((t, i) => (
          <div key={`${t.url}-${i}`} className={trackPlayer.isPlaying(t.url) ? `${styles.row} ${styles.rowPlaying}` : styles.row} onClick={() => trackPlayer.toggle(t.url)}>
            <PlayButton track={t} size={36} />
            <div className={styles.body}>
              <p className={styles.name}>
                <span className={styles.nameText}>{trackTitle(t)}</span>
              </p>
              <span className={styles.timeWrap}>
                {i === 0 ? <span className={styles.badge}>основной</span> : null}
                <span className={styles.time}>{timeLabel(t)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
