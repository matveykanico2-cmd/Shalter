import type { CSSProperties, ReactNode } from "react";

import { Avatar, Icon } from "@/shared/ui";

import { isCallLogMessage, isReadByOthers, NAME_COLORS, timeLabel } from "../lib/message-meta";
import { callLogInfo, messagePreview, stripCustomEmoji } from "../lib/message-preview";
import type { FeedMessage, Message, ReplyTarget } from "../model/types";

import styles from "./message-bubble.module.css";
import { MessageText } from "./message-text";

/** Автор сообщения, как его показывает лента (участник чата или сам канал). */
export type MessageSender = {
  id: string;
  name: string;
  avatarColor?: string | null;
  avatarImage?: string | null;
  nameColor?: string | null;
};

type Props = {
  message: FeedMessage;
  mine: boolean;
  sender?: MessageSender | null;
  /** Имя над пузырём и аватар у последнего в серии — в группах. */
  showSender?: boolean;
  showAvatar?: boolean;
  groupStart?: boolean;
  groupEnd?: boolean;
  isChannel?: boolean;
  replyTo?: Message | ReplyTarget | null;
  replyToName?: string | null;
  onReply?: (m: Message) => void;
  onJumpTo?: (id: string) => void;
};

/** Пузырь сообщения в ленте — основа MessageBubble из public/js/components/messageBubble.js. */
export function MessageBubble(props: Props) {
  const { message: m, mine, sender, showSender, showAvatar, groupStart = true, groupEnd = true, isChannel = false } = props;

  if (m.type === "system") return <SystemLine text={m.text ?? ""} />;

  // Как в Telegram: пост канала — от канала, «свои» пузыри справа только вне каналов.
  const out = mine && !isChannel;
  const isCall = isCallLogMessage(m);
  const sticker = m.type === "sticker" ? (m.sticker as { emoji?: string } | undefined) : undefined;
  const attachmentLine = attachmentLabel(m);
  const text = !isCall && !sticker && m.text?.trim() ? m.text : null;

  const meta = (
    <span className={styles.meta}>
      {m.visibleToId ? <span title="Это сообщение бота видите только вы">👁 только вам</span> : null}
      {m.editedAt ? <span>изменено</span> : null}
      <span>{timeLabel(m.createdAt)}</span>
      {isChannel && typeof m.views === "number" ? <span>{m.views} 👁</span> : null}
      {mine ? (
        <span className={m.pending ? styles.pending : styles.tick} aria-label={m.pending ? "Отправляется" : isReadByOthers(m) ? "Прочитано" : "Доставлено"}>
          <Icon name={m.pending ? "Clock" : isReadByOthers(m) ? "CheckCheck" : "Check"} size={14} />
        </span>
      ) : null}
    </span>
  );

  const nameColor = sender?.nameColor ? NAME_COLORS[sender.nameColor] : undefined;
  const nameStyle = nameColor ? ({ "--name-light": nameColor.light, "--name-dark": nameColor.dark } as CSSProperties) : undefined;

  const body: ReactNode[] = [];
  if (showSender && !mine && sender) {
    body.push(
      <span key="sender" className={styles.sender} style={nameStyle}>
        {sender.name}
      </span>
    );
  }
  const forwarded = m.forwardedFrom as { senderName?: string } | undefined;
  if (forwarded?.senderName) {
    body.push(
      <p key="fwd" className={styles.forwarded}>
        <Icon name="Forward" size={12} /> Переслано от {forwarded.senderName}
      </p>
    );
  }
  if (m.replyToId) body.push(<ReplyQuote key="reply" target={props.replyTo} name={props.replyToName} onJumpTo={props.onJumpTo} />);
  if (attachmentLine) body.push(<p key="att" className={styles.attachment}>{attachmentLine}</p>);

  if (isCall) body.push(<CallBody key="call" message={m} mine={mine} />);
  else if (sticker) {
    body.push(
      <span key="sticker" className={styles.sticker} role="img" aria-label="Стикер">
        {sticker.emoji ?? "🖼"}
      </span>
    );
  }
  if (text) body.push(<MessageText key="text" text={text} meta={meta} />);
  else if (!isCall) body.push(<span key="meta" className={styles.metaRow}>{meta}</span>);

  const bubbleClass = [styles.bubble, out ? styles.out : styles.in, groupStart ? "" : styles.joinTop, groupEnd ? "" : styles.joinBottom, sticker ? styles.stickerBubble : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={out ? `${styles.row} ${styles.rowOut}` : styles.row} data-message-id={m.id}>
      {showAvatar !== undefined ? (
        <span className={styles.avatarSlot}>
          {showAvatar && sender ? <Avatar size={34} name={sender.name} color={sender.avatarColor} image={sender.avatarImage} /> : null}
        </span>
      ) : null}
      <div className={bubbleClass}>{body}</div>
      {props.onReply && !m.pending ? (
        <button type="button" className={styles.replyButton} title="Ответить" onClick={() => props.onReply?.(m)}>
          <Icon name="Reply" size={16} />
        </button>
      ) : null}
    </div>
  );
}

function SystemLine({ text }: { text: string }) {
  const clean = stripCustomEmoji(text).replace(/^\s*🔒\s*/u, "");
  // Начало секретного чата — карточка по центру.
  const secret = clean.match(/^(.+?) начал\(а\) секретный чат/);
  if (secret) {
    return (
      <div className={styles.system}>
        <div className={styles.secretCard}>
          <p className={styles.secretTitle}>{secret[1]} начал(а) секретный чат</p>
          <p>Секретные чаты:</p>
          <ul>
            <li>Шифруются ключом этого чата</li>
            <li>Доступны только на этом устройстве</li>
            <li>Сообщения нельзя переслать</li>
          </ul>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.system}>
      <span className={styles.systemText}>{clean}</span>
    </div>
  );
}

function ReplyQuote({ target, name, onJumpTo }: { target?: Message | ReplyTarget | null; name?: string | null; onJumpTo?: (id: string) => void }) {
  if (!target || "deleted" in target) return <div className={`${styles.reply} ${styles.replyDeleted}`}>Удалённое сообщение</div>;
  return (
    <button type="button" className={styles.reply} onClick={() => onJumpTo?.(target.id)}>
      {name ? <span className={styles.replyName}>{name}</span> : null}
      <span className={styles.replyText}>{stripCustomEmoji(messagePreview(target as Message)) || "Сообщение"}</span>
    </button>
  );
}

function CallBody({ message, mine }: { message: Message; mine: boolean }) {
  const { video, answered, durationSec, title } = callLogInfo(message, mine);
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;
  const duration = answered ? (min ? `${min} мин${sec ? ` ${sec} с` : ""}` : `${sec} с`) : "";
  return (
    <div className={answered ? styles.call : `${styles.call} ${styles.callMissed}`}>
      <span className={styles.callTitle}>{title}</span>
      <span className={styles.callStatus}>
        <span className={`${styles.callArrow} ${mine ? styles.callOut : ""}`}>➜</span>
        {timeLabel(message.createdAt)}
        {duration ? `, ${duration}` : ""}
      </span>
      <span className={styles.callIcon}>
        <Icon name={video ? "Video" : "Phone"} size={22} />
      </span>
    </div>
  );
}

/**
 * Вложения (фото, файлы, опросы, подарки…) рисуются следующими шагами этапа 4 —
 * пока подпись одной строкой, как в превью списка чатов, чтобы ничего не терялось.
 */
function attachmentLabel(m: Message) {
  if (m.type === "gift") return messagePreview(m);
  if (!m.attachments?.length) return null;
  return messagePreview({ ...m, text: null });
}
