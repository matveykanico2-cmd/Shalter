import { useRef } from "react";

import { playExclusive } from "@/shared/lib/exclusive-media";
import { Icon } from "@/shared/ui";

import { AUDIO_EXT_RE, clockTime, fileColor, fileExt, formatSize, isAudioFile } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";

import styles from "./attachments.module.css";
import { useMediaProgress, useSeek } from "./use-media-progress";

type Props = { attachment: Attachment; canDownload: boolean };

/** Файл: плитка с расширением и размером; музыка — со своим плеером (attachments.js). */
export function FileAttachment({ attachment, canDownload }: Props) {
  if (isAudioFile(attachment)) return <AudioFile attachment={attachment} canDownload={canDownload} />;
  const ext = fileExt(attachment.name);
  const color = fileColor(ext);
  const body = (
    <>
      <span className={styles.fileIcon} style={color ? ({ "--file-color": color } as React.CSSProperties) : undefined}>
        <span className={styles.fileExt}>{ext.slice(0, 4) || "file"}</span>
        {canDownload ? (
          <span className={styles.fileDownload}>
            <Icon name="Download" size={22} />
          </span>
        ) : null}
      </span>
      <span className={styles.fileInfo}>
        <span className={styles.fileName}>{attachment.name || "Файл"}</span>
        <span className={styles.fileSize}>{attachment.size ? formatSize(attachment.size) : ""}</span>
      </span>
    </>
  );
  // В чате с запретом сохранения файл не скачивается.
  if (!canDownload || !attachment.url) return <div className={styles.file}>{body}</div>;
  return (
    <a className={styles.file} href={attachment.url} download={attachment.name || "file"}>
      {body}
    </a>
  );
}

function AudioFile({ attachment: a, canDownload }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const { playing, current, duration } = useMediaProgress(audio, a.durationSec ?? 0);
  const seek = useSeek(audio, duration);
  const title = (a.name || "Аудио").replace(AUDIO_EXT_RE, "");
  const started = current > 0 || playing;
  const sub = started && duration ? `${clockTime(current)} / ${clockTime(duration)}` : a.size ? formatSize(a.size) : duration ? clockTime(duration) : "";
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      playExclusive(el);
      void el.play().catch(() => {});
    } else el.pause();
  };
  return (
    <div className={styles.audio}>
      <audio ref={audio} src={a.url} preload="none" />
      <button type="button" className={styles.audioPlay} aria-label={playing ? "Пауза" : "Слушать"} onClick={toggle}>
        <Icon name={playing ? "PauseFill" : "PlayFill"} size={22} />
      </button>
      <span className={styles.audioInfo}>
        <span className={styles.audioTitle}>{title}</span>
        <span className={styles.audioSub}>{sub}</span>
        {started ? (
          <span className={styles.audioTrack} {...seek}>
            <span className={styles.audioFill} style={{ transform: `scaleX(${duration ? Math.min(1, current / duration) : 0})` }} />
          </span>
        ) : null}
      </span>
      {canDownload ? (
        <a className={styles.audioDownload} href={a.url} download={a.name || "audio"} title="Скачать">
          <Icon name="Download" size={18} />
        </a>
      ) : null}
    </div>
  );
}
