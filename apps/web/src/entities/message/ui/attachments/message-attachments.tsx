import type { ReactNode } from "react";

import { attachmentsOf, isVisualMedia } from "../../lib/attachments";
import { messagePreview } from "../../lib/message-preview";
import type { Attachment } from "../../model/attachment";
import type { Message } from "../../model/types";

import styles from "./attachments.module.css";
import { FileAttachment } from "./file-attachment";
import { ImageAttachment } from "./image-attachment";
import { BirthdayAttachment, ContactAttachment, LocationAttachment } from "./misc-attachments";
import { VideoAttachment } from "./video-attachment";
import { VideoNotePlayer } from "./video-note-player";
import { VoicePlayer } from "./voice-player";

type Props = {
  message: Message;
  canDownload: boolean;
  /** Открыть просмотр: url фото/видео из этого сообщения. */
  onOpenMedia?: (url: string) => void;
  onDoubleTap?: (at: { x: number; y: number }) => void;
};

/**
 * Вложения пузыря по порядку, как в MessageBubble (messageBubble.js): два и больше
 * фото/видео — одним альбомом там, где стоит первое из них.
 */
export function MessageAttachments({ message, canDownload, onOpenMedia, onDoubleTap }: Props) {
  const atts = attachmentsOf(message);
  const media = atts.filter(isVisualMedia);
  const album = media.length >= 2;
  const out: ReactNode[] = [];
  let albumPlaced = false;

  const tile = (a: Attachment, i: number, inAlbum: boolean) =>
    a.kind === "video" ? (
      <VideoAttachment key={i} attachment={a} messageId={message.id} inAlbum={inAlbum} onOpen={() => onOpenMedia?.(a.url!)} onDoubleTap={onDoubleTap} />
    ) : (
      <ImageAttachment key={i} attachment={a} inAlbum={inAlbum} onOpen={() => onOpenMedia?.(a.url!)} onDoubleTap={onDoubleTap} />
    );

  atts.forEach((a, i) => {
    if (isVisualMedia(a)) {
      if (!album) {
        out.push(tile(a, i, false));
        return;
      }
      if (albumPlaced) return;
      albumPlaced = true;
      const n = Math.min(media.length, 4);
      out.push(
        <div key="album" className={[styles.album, styles[`album${n}`], media.length > 4 ? styles.albumMany : ""].filter(Boolean).join(" ")}>
          {media.map((m, j) => (
            <div key={j} className={styles.albumCell}>
              {tile(m, j, true)}
            </div>
          ))}
        </div>
      );
      return;
    }
    out.push(<AttachmentView key={i} attachment={a} message={message} canDownload={canDownload} />);
  });
  return out;
}

function AttachmentView({ attachment: a, message, canDownload }: { attachment: Attachment; message: Message; canDownload: boolean }) {
  switch (a.kind) {
    case "voice":
      return a.url ? <VoicePlayer attachment={a} /> : null;
    case "video-note":
      return a.url ? <VideoNotePlayer attachment={a} /> : null;
    case "file":
      return <FileAttachment attachment={a} canDownload={canDownload} />;
    case "location":
      return <LocationAttachment attachment={a} />;
    case "contact":
      return <ContactAttachment attachment={a} />;
    case "birthday":
      return <BirthdayAttachment attachment={a} />;
    default:
      // Опрос, чек-лист, кубик, игра, платное медиа — следующими шагами; пока подпись, как в списке чатов.
      return <p className={styles.pendingKind}>{messagePreview({ ...message, text: null, attachments: [a] })}</p>;
  }
}
