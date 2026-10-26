import { Fragment, type ReactNode, use, useState } from "react";

import { Icon } from "@/shared/ui";

import { attachmentsOf, isVisualMedia } from "../../lib/attachments";
import { messagePreview } from "../../lib/message-preview";
import type { Attachment } from "../../model/attachment";
import { MessageLinks } from "../../model/message-links";
import type { FeedMessage as Message } from "../../model/types";

import styles from "./attachments.module.css";
import { type ChecklistActions, ChecklistAttachment } from "./checklist-attachment";
import { DiceAttachment, GameCard } from "./dice-attachment";
import { FileAttachment } from "./file-attachment";
import { ImageAttachment } from "./image-attachment";
import { BirthdayAttachment, ContactAttachment, LocationAttachment } from "./misc-attachments";
import { PaidMedia } from "./paid-media";
import { type PollActions, PollAttachment } from "./poll-attachment";
import { VideoAttachment } from "./video-attachment";
import { VideoNotePlayer } from "./video-note-player";
import { VoicePlayer } from "./voice-player";

/** Голос, чек-лист, открыть платный пост — делают фичи, пузырь только зовёт. */
export type AttachmentActions = {
  poll?: PollActions;
  checklist?: ChecklistActions;
  onUnlockPaid?: (m: Message, meta: { stars: number; label: string }) => void;
};

type Props = {
  message: Message;
  meId: string;
  nameOf: (userId: string) => string;
  actions?: AttachmentActions;
  canDownload: boolean;
  /** Открыть просмотр: url фото/видео из этого сообщения. */
  onOpenMedia?: (url: string) => void;
  onDoubleTap?: (at: { x: number; y: number }) => void;
  /** Автор — подпись в «сейчас играет». */
  senderName?: string | null;
};

/**
 * Вложения пузыря по порядку, как в MessageBubble (messageBubble.js): два и больше
 * фото/видео — одним альбомом там, где стоит первое из них.
 */
export function MessageAttachments({ message, meId, nameOf, actions, canDownload, onOpenMedia, onDoubleTap, senderName = null }: Props) {
  const atts = attachmentsOf(message);
  const media = atts.filter(isVisualMedia);
  const album = media.length >= 2;
  const out: ReactNode[] = [];
  let albumPlaced = false;

  const { tapToLoad } = use(MessageLinks);
  const tile = (a: Attachment, i: number, inAlbum: boolean) => {
    const view =
      a.kind === "video" ? (
        <VideoAttachment attachment={a} messageId={message.id} inAlbum={inAlbum} onOpen={() => onOpenMedia?.(a.url!)} onDoubleTap={onDoubleTap} />
      ) : (
        <ImageAttachment attachment={a} inAlbum={inAlbum} onOpen={() => onOpenMedia?.(a.url!)} onDoubleTap={onDoubleTap} />
      );
    return tapToLoad ? (
      <TapToLoad key={i} kind={a.kind === "video" ? "video" : "image"}>
        {view}
      </TapToLoad>
    ) : (
      <Fragment key={i}>{view}</Fragment>
    );
  };

  atts.forEach((a, i) => {
    if (isVisualMedia(a)) {
      if (!album) {
        out.push(tile(a, i, false));
        return;
      }
      if (albumPlaced) return;
      albumPlaced = true;
      out.push(<Album key="album" media={media} tile={tile} />);
      return;
    }
    switch (a.kind) {
      case "poll":
        out.push(<PollAttachment key={i} message={message} attachment={a} meId={meId} {...actions?.poll} />);
        return;
      case "checklist":
        out.push(<ChecklistAttachment key={i} message={message} attachment={a} meId={meId} nameOf={nameOf} {...actions?.checklist} />);
        return;
      case "dice":
        out.push(<DiceAttachment key={i} message={message} attachment={a} />);
        return;
      case "game":
        out.push(<GameCard key={i} attachment={a} />);
        return;
      case "paid":
        out.push(
          <PaidMedia
            key={i}
            message={message}
            attachment={a}
            onUnlock={actions?.onUnlockPaid}
            renderMedia={(list) => (list.length === 1 ? tile(list[0]!, 0, false) : <Album media={list} tile={tile} />)}
          />
        );
        return;
    }
    out.push(<AttachmentView key={i} attachment={a} message={message} canDownload={canDownload} senderName={senderName} />);
  });
  return out;
}

function Album({ media, tile }: { media: Attachment[]; tile: (a: Attachment, i: number, inAlbum: boolean) => ReactNode }) {
  const n = Math.min(media.length, 4);
  return (
    <div className={[styles.album, styles[`album${n}`], media.length > 4 ? styles.albumMany : ""].filter(Boolean).join(" ")}>
      {media.map((m, j) => (
        <div key={j} className={styles.albumCell}>
          {tile(m, j, true)}
        </div>
      ))}
    </div>
  );
}

function AttachmentView({ attachment: a, message, canDownload, senderName }: { attachment: Attachment; message: Message; canDownload: boolean; senderName: string | null }) {
  switch (a.kind) {
    case "voice":
      return a.url ? <VoicePlayer attachment={a} message={message} senderName={senderName} /> : null;
    case "video-note":
      return a.url ? <VideoNotePlayer attachment={a} message={message} senderName={senderName} /> : null;
    case "file":
      return <FileAttachment attachment={a} canDownload={canDownload} message={message} senderName={senderName} />;
    case "location":
      return <LocationAttachment attachment={a} />;
    case "contact":
      return <ContactAttachment attachment={a} />;
    case "birthday":
      return <BirthdayAttachment attachment={a} />;
    default:
      // Незнакомый вид — подписью, как в списке чатов.
      return <p className={styles.pendingKind}>{messagePreview({ ...message, text: null, attachments: [a] })}</p>;
  }
}

/** Экономия трафика: вместо фото или видео — кнопка, по нажатию грузится (TapToLoad в messageBubble.js). */
function TapToLoad({ kind, children }: { kind: "image" | "video"; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown) return children;
  return (
    <button
      type="button"
      className={styles.tapToLoad}
      onClick={(e) => {
        e.stopPropagation();
        setShown(true);
      }}
    >
      <Icon name={kind === "video" ? "Play" : "Download"} size={18} />
      <span>{kind === "video" ? "Нажмите, чтобы посмотреть видео" : "Нажмите, чтобы посмотреть фото"}</span>
    </button>
  );
}
