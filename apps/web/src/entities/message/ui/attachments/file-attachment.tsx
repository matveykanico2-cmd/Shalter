import { Icon } from "@/shared/ui";

import { AUDIO_EXT_RE, clockTime, fileColor, fileExt, formatSize, isAudioFile } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import styles from "./attachments.module.css";
import { useSeek } from "./use-media-progress";
import { usePlayer } from "./use-player";

type Props = { attachment: Attachment; canDownload: boolean; message: FeedMessage; senderName: string | null };

/** Файл: плитка с расширением и размером; музыка — со своим плеером (attachments.js). */
export function FileAttachment(props: Props) {
  const { attachment, canDownload } = props;
  if (isAudioFile(attachment)) return <AudioFile {...props} />;
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

function AudioFile({ attachment: a, canDownload, message, senderName }: Props) {
  const { ref: audio, toggle, playing, current, duration } = usePlayer(message, a, "audio", senderName);
  const seek = useSeek(audio, duration);
  const title = (a.name || "Аудио").replace(AUDIO_EXT_RE, "");
  const started = current > 0 || playing;
  const sub = started && duration ? `${clockTime(current)} / ${clockTime(duration)}` : a.size ? formatSize(a.size) : duration ? clockTime(duration) : "";
  return (
    <div className={styles.audio}>
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
