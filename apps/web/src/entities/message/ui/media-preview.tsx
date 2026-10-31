import { GiftArt, type MessageGift } from "@/entities/gift/@x/message";

import { EmojiText, Icon } from "@/shared/ui";

import type { Previewable } from "../lib/media-preview";
import { messagePreview, plainText, stripCustomEmoji } from "../lib/message-preview";
import type { Attachment } from "../model/attachment";
import type { Message } from "../model/types";

import styles from "./media-preview.module.css";


const clock = (sec?: number) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const isImage = (a: Attachment) => a.kind === "image" || (a.kind === "file" && /^image\//.test(a.mimeType ?? ""));
const isVideo = (a: Attachment) => a.kind === "video" || a.kind === "video-note" || (a.kind === "file" && /^video\//.test(a.mimeType ?? ""));

/** Картинка миниатюры: у фото — превью или само фото, у видео — обложка (blob: — ещё не загруженный файл). */
function thumbOf(a: Attachment) {
  if (isImage(a)) return a.thumbUrl || a.url || null;
  return a.posterUrl || (a.thumbUrl && !a.thumbUrl.startsWith("blob:") ? a.thumbUrl : null);
}

function Mini({ a, round, size }: { a: Attachment; round?: boolean; size: number }) {
  const src = thumbOf(a);
  const cls = round ? `${styles.thumb} ${styles.round}` : styles.thumb;
  const style = { width: size, height: size };
  if (src) return <img className={cls} style={style} src={src} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />;
  // У кружка или видео без обложки — первый кадр самого ролика.
  if (isVideo(a) && a.url && a.kind !== "video-note") return <video className={cls} style={style} src={`${a.url}#t=0.1`} muted playsInline preload="metadata" />;
  if (a.kind === "video-note") {
    return (
      <span className={`${cls} ${styles.round} ${styles.videoNotePlaceholder}`} style={style}>
        <Icon name="PlayFill" size={Math.max(8, Math.round(size * 0.42))} />
      </span>
    );
  }
  if (a.kind === "voice") {
    return (
      <span className={`${styles.iconWrap} ${styles.round}`} style={style}>
        <Icon name="Mic" size={Math.max(9, Math.round(size * 0.48))} />
      </span>
    );
  }
  if (a.kind === "file") {
    return (
      <span className={`${styles.fileWrap}`} style={style}>
        <Icon name="File" size={Math.max(10, Math.round(size * 0.52))} />
      </span>
    );
  }
  return null;
}

type Props = {
  message: Previewable;
  /** «Вы: » перед превью в списке чатов. */
  who?: string;
  /** 20 px в списке чатов, 28 px в цитате ответа и плашке над полем ввода. */
  size?: number;
  className?: string;
};

/**
 * Превью сообщения с медиа (public/js/components/mediaPreview.js), как в Telegram: вместо «📷 Фото»
 * и «🎤 Голосовое» — сама миниатюра (круглая у кружка) или значок с длительностью, у подарка — его картинка.
 */
export function MediaPreview({ message: m, who, size = 20, className }: Props) {
  const a = m.attachments?.[0] as Attachment | undefined;
  const text = plainText(stripCustomEmoji(m.text)).trim();
  const label = (t: string) => (
    <span key="label" className={styles.text}>
      <EmojiText text={t} />
    </span>
  );
  const parts = [];
  if (who) parts.push(<span key="who" className={styles.who}>{who}</span>);
  const gift = m.type === "gift" ? (m.gift as MessageGift | undefined) : undefined;
  if (gift) {
    parts.push(
      <span key="gift" className={styles.gift} style={{ width: size, height: size }}>
        <GiftArt gift={gift} size={size} replay={false} className={styles.giftArt} />
      </span>,
      label(gift.name || "Подарок"),
    );
  } else if (m.type === "article") {
    // Статья: миниатюра обложки и «📰 Заголовок», без markdown тела.
    if (a && isImage(a) && thumbOf(a)) parts.push(<Mini key="thumb" a={a} size={size} />);
    parts.push(label(messagePreview(m as Message)));
  } else if (!a || m.type === "sticker") {
    parts.push(label(messagePreview(m as Message)));
  } else if (a.kind === "video-note" || a.kind === "voice") {
    parts.push(
      a.kind === "voice" ? (
        <span key="thumb" className={styles.iconWrap} style={{ width: size, height: size }}>
          <Icon name="Mic" size={Math.max(9, Math.round(size * 0.48))} />
        </span>
      ) : (
        <Mini key="thumb" a={a} round size={size} />
      ),
      <span key="label" className={styles.text}>
        <span className={styles.dur}>{a.durationSec ? clock(a.durationSec) : a.kind === "voice" ? "Голосовое" : "Кружок"}</span>
        {text ? <EmojiText text={` ${text}`} /> : null}
      </span>,
    );
  } else if (isImage(a) || isVideo(a)) {
    const same = (x: Attachment) => x.kind === a.kind || (a.kind === "file" && x.kind === "file" && /^image\/|^video\//.test(x.mimeType ?? ""));
    const count = (m.attachments as Attachment[]).filter(same).length;
    const fallback = a.kind === "image" ? (count > 1 ? `${count} фото` : "Фото") : a.durationSec ? clock(a.durationSec) : count > 1 ? `${count} видео` : "Видео";
    if (thumbOf(a) || (isVideo(a) && a.url)) {
      parts.push(
        <span key="thumb" className={styles.thumbWrap}>
          <Mini a={a} size={size} />
          {a.kind === "video" || (a.kind === "file" && /^video\//.test(a.mimeType ?? "")) ? (
            <span className={styles.play}>
              <Icon name="PlayFill" size={8} />
            </span>
          ) : null}
        </span>,
      );
    }
    parts.push(label(text || fallback));
  } else if (a?.kind === "game") {
    const meta = (a.meta ?? {}) as { emoji?: string; title?: string };
    parts.push(
      <span key="game" className={styles.gameThumb}>
        <span className={styles.gameEmoji}>{meta.emoji || "🎮"}</span>
      </span>,
      label(meta.title || "Игра"),
    );
  } else {
    parts.push(label(messagePreview(m as Message)));
  }
  return <span className={className ? `${styles.line} ${className}` : styles.line}>{parts}</span>;
}
