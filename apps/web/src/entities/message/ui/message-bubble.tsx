import { type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, useEffect, useRef } from "react";

import type { Sticker } from "@/shared/lib/anim";
import { useLongPress } from "@/shared/lib/use-long-press";
import { Avatar, Icon } from "@/shared/ui";

import { isMediaOnly, linkPreviewOf } from "../lib/attachments";
import { customEmojiOnly, jumboEmojiCount } from "../lib/jumbo";
import { keyboardOf } from "../lib/keyboard";
import { playMessageEffect, shouldPlayEffect } from "../lib/message-effect";
import { isCallLogMessage, isReadByOthers, NAME_COLORS, timeLabel } from "../lib/message-meta";
import { callLogInfo, messagePreview, stripCustomEmoji } from "../lib/message-preview";
import { type Reaction, reactionsOf,reactionSticker } from "../lib/reactions";
import { justReacted } from "../lib/reactions-anim";
import type { FeedMessage, Message, ReplyTarget } from "../model/types";

import { type AttachmentActions, MessageAttachments } from "./attachments/message-attachments";
import { LinkPreviewCard } from "./attachments/misc-attachments";
import { CustomEmoji, JumboEmoji, ReactionGlyph, StickerBody } from "./animated";
import { MessageKeyboard } from "./keyboard";
import styles from "./message-bubble.module.css";
import { MessageText } from "./message-text";

/** Автор сообщения, как его показывает лента (участник чата или сам канал). */
export type MessageSender = {
  id: string;
  name: string;
  avatarColor?: string | null;
  avatarImage?: string | null;
  nameColor?: string | null;
  isBot?: boolean;
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
  /** Для «своих» реакций; без него реакции только показываются. */
  meId?: string;
  /** Ответ; quote — выделенная в пузыре часть текста. */
  onReply?: (m: Message, quote?: string) => void;
  onJumpTo?: (id: string) => void;
  /** Меню сообщения: «Ещё», правая кнопка, долгое нажатие пальцем. */
  onOpenMenu?: (m: Message, at: Point, quote?: string) => void;
  /** Полоса реакций — двойное нажатие. */
  onOpenReactions?: (m: Message, at: Point) => void;
  onReact?: (m: Message, emoji: string) => void;
  /** Открыть фото или видео этого сообщения в просмотрщике. */
  onOpenMedia?: (m: Message, url: string) => void;
  /** Чат с запретом сохранения: без кнопок «скачать». */
  protectedContent?: boolean;
  /** Опросы, чек-листы, платные посты. */
  attachmentActions?: AttachmentActions;
  /** Имя участника по id — «кто отметил» в чек-листе. */
  nameOf?: (userId: string) => string;
  /** Участник по id — аватарки на реакциях. */
  userOf?: (userId: string) => MessageSender | null;
  /** «Кто поставил» — долгое нажатие или правая кнопка на реакции; без него — только нажатие. */
  onReactionDetails?: (m: Message, emoji: string, at: Point) => void;
  /** Режим выбора: нажатие отмечает сообщение, а не открывает его. */
  selecting?: boolean;
  selected?: boolean;
  /** Отметить или снять (долгое нажатие мышью начинает выбор); без него не выбирается — подарок. */
  onToggleSelect?: (m: Message) => void;
  /** «Кратко»: строка — сводка, null — ещё делается. */
  summary?: string | null;
};

type Point = { x: number; y: number };

/** Кнопки над пузырём и реакции не открывают меню долгим нажатием. */
const NO_HOLD = "button, a, input, textarea";
// Двойное нажатие — как в messageBubble.js: два касания за 200 мс в пределах 24 px.
const DOUBLE_TAP_MS = 200;
const DOUBLE_TAP_PX = 24;
// Ответ свайпом влево пальцем — как в Telegram: сдвиг до 72 px, ответ от 48 px.
const SWIPE_START_PX = 12;
const SWIPE_REPLY_PX = 48;
const SWIPE_MAX_PX = 72;
const QUOTE_MAX = 500;

const hasTextSelection = () => {
  const sel = window.getSelection?.();
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== "";
};

/** Выделенный внутри пузыря текст — ответ его процитирует. */
function selectedQuote(container: HTMLElement | null) {
  const sel = window.getSelection?.();
  if (!container || !sel || sel.isCollapsed) return "";
  const text = sel.toString().trim();
  return text && container.contains(sel.anchorNode) && container.contains(sel.focusNode) ? text.slice(0, QUOTE_MAX) : "";
}

/** Пузырь сообщения в ленте — основа MessageBubble из public/js/components/messageBubble.js. */
export function MessageBubble(props: Props) {
  const { message: m, mine, sender, showSender, showAvatar, groupStart = true, groupEnd = true, isChannel = false } = props;
  const { selecting = false, onToggleSelect } = props;
  const actionable = !m.pending && !!props.onOpenMenu;
  const rowRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Выделение снимается раньше, чем дойдёт click, — запоминаем его при нажатии.
  const quote = useRef("");
  const remember = () => {
    quote.current = selectedQuote(bubbleRef.current);
  };
  const takeQuote = () => {
    const q = quote.current;
    quote.current = "";
    return q || undefined;
  };
  const hold = useLongPress(
    (at, pointerType) => {
      // Пальцем — меню действий (как в Telegram), мышью — начать выбор; в режиме выбора — отметить.
      if (selecting || pointerType === "mouse") {
        onToggleSelect?.(m);
        return;
      }
      remember();
      props.onOpenMenu?.(m, at, takeQuote());
    },
    NO_HOLD,
    { mouse: !!onToggleSelect }
  );
  const lastTap = useRef({ at: 0, x: 0, y: 0 });
  const swipe = useRef<{ x: number; y: number; active: boolean | null } | null>(null);

  // Эффект играет один раз — у только что пришедшего или отправленного.
  const effect = typeof m.effect === "string" ? m.effect : null;
  useEffect(() => {
    if (!effect || m.pending || !shouldPlayEffect(m.id, m.createdAt)) return;
    const frame = requestAnimationFrame(() => playMessageEffect(effect, bubbleRef.current));
    return () => cancelAnimationFrame(frame);
  }, [effect, m.id, m.pending, m.createdAt]);

  if (m.type === "system") return <SystemLine text={m.text ?? ""} />;

  // Как в Telegram: пост канала — от канала, «свои» пузыри справа только вне каналов.
  const out = mine && !isChannel;
  const isCall = isCallLogMessage(m);
  const sticker = m.type === "sticker" ? (m.sticker as Sticker | undefined) : undefined;
  const giftLine = m.type === "gift" ? messagePreview(m) : null;
  // У опроса и чек-листа текст — их заголовок, его рисует само вложение.
  const titled = m.attachments?.some((a) => (a as { kind?: string }).kind === "poll" || (a as { kind?: string }).kind === "checklist");
  const text = !isCall && !sticker && !titled && m.text?.trim() ? m.text : null;
  const mediaOnly = !isCall && isMediaOnly(m);
  const preview = linkPreviewOf(m);
  const summary = props.summary;
  // Под текстом ещё что-то (карточка ссылки, сводка) — время уходит в свою строку.
  const below = !!preview || summary !== undefined;

  const meta = (
    <span className={styles.meta}>
      {m.visibleToId ? <span title="Это сообщение бота видите только вы">👁 только вам</span> : null}
      {effect ? (
        <button
          type="button"
          className={styles.effectBadge}
          title="Повторить эффект"
          onClick={(e) => {
            e.stopPropagation();
            playMessageEffect(effect, bubbleRef.current);
          }}
        >
          {effect}
        </button>
      ) : null}
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
  if (giftLine) body.push(<p key="gift" className={styles.attachment}>{giftLine}</p>);
  if (m.attachments?.length && !isCall) {
    body.push(
      <MessageAttachments
        key="att"
        message={m}
        meId={props.meId ?? ""}
        nameOf={props.nameOf ?? (() => "участник")}
        actions={props.attachmentActions}
        canDownload={!props.protectedContent}
        onOpenMedia={props.onOpenMedia ? (url) => props.onOpenMedia?.(m, url) : undefined}
        onDoubleTap={!m.pending && props.onOpenReactions ? (at) => props.onOpenReactions?.(m, at) : undefined}
      />
    );
  }

  if (isCall) body.push(<CallBody key="call" message={m} mine={mine} />);
  else if (sticker) {
    body.push(<StickerBody key="sticker" messageId={m.id} sticker={sticker} />);
  }
  const reactions = reactionsOf(m);
  // 1–3 эмодзи или только свои эмодзи — крупно, как в Telegram.
  const plain = !m.attachments?.length;
  const ceOnly = text && plain && Array.isArray(m.customEmoji) ? customEmojiOnly(text) : null;
  const jumbo = text && plain && !ceOnly ? jumboEmojiCount(text) : 0;
  if (text && ceOnly && ceOnly.length <= 3) {
    const scenes = m.customEmoji as unknown[];
    body.push(
      <span key="text" className={styles.customJumbo}>
        {ceOnly.map((idx, i) => (scenes[idx] ? <CustomEmoji key={i} scene={scenes[idx]} jumbo /> : <span key={i}>🎨</span>))}
      </span>
    );
  } else if (text && jumbo) body.push(<JumboEmoji key="text" messageId={m.id} text={text} count={jumbo} />);
  else if (text) body.push(<MessageText key="text" text={text} customEmoji={Array.isArray(m.customEmoji) ? m.customEmoji : undefined} meta={reactions.length || below ? null : meta} />);
  if (preview) body.push(<LinkPreviewCard key="preview" preview={preview} />);
  if (summary !== undefined) {
    body.push(
      <div key="summary" className={styles.summary}>
        <span className={styles.summaryLabel}>Кратко</span>
        <p className={styles.summaryText}>{summary ?? "Делаем сводку…"}</p>
      </div>
    );
  }
  if (reactions.length) {
    body.push(
      <div key="reactions" className={styles.reactions}>
        {reactions.map((r) => (
          <ReactionPill
            key={r.emoji}
            reaction={r}
            own={!!props.meId && r.userIds.includes(props.meId)}
            play={justReacted(m.id, r.emoji)}
            disabled={!props.onReact || !!m.pending}
            userOf={props.userOf}
            onReact={() => props.onReact?.(m, r.emoji)}
            onDetails={props.onReactionDetails && !m.pending ? (at) => props.onReactionDetails?.(m, r.emoji, at) : undefined}
          />
        ))}
        {!isCall ? meta : null}
      </div>
    );
  } else if (mediaOnly) {
    // Фото/видео без подписи: время лежит поверх медиа (как в tweb); у кружка внизу свой
    // таймер — время сообщения под ним.
    const note = (m.attachments?.[0] as { kind?: string } | undefined)?.kind === "video-note";
    body.push(
      <span key="meta" className={note ? styles.metaBelow : styles.metaOverlay}>
        {meta}
      </span>
    );
  } else if ((!text || below || jumbo || (ceOnly && ceOnly.length <= 3)) && !isCall) body.push(<span key="meta" className={styles.metaRow}>{meta}</span>);

  const bubbleClass = [styles.bubble, out ? styles.out : styles.in, groupStart ? "" : styles.joinTop, groupEnd ? "" : styles.joinBottom, sticker ? styles.stickerBubble : "", mediaOnly ? styles.mediaOnly : ""]
    .filter(Boolean)
    .join(" ");

  const onContextMenu = (e: MouseEvent) => {
    if (!actionable || hold.swallow(e)) return;
    e.preventDefault();
    if (selecting) {
      onToggleSelect?.(m);
      return;
    }
    remember();
    props.onOpenMenu?.(m, { x: e.clientX, y: e.clientY }, takeQuote());
  };
  const onClickCapture = (e: MouseEvent) => {
    if (hold.swallow(e) || !selecting || !onToggleSelect || m.pending) return;
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect(m);
  };

  const resetSwipe = () => {
    swipe.current = null;
    const row = rowRef.current;
    if (!row) return;
    row.style.transform = "";
    row.classList.remove(styles.swipeReady!);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (actionable) hold.onPointerDown(e);
    // Как в tweb: свайп-ответ только пальцем — мышью тянут, чтобы выделить текст.
    swipe.current = e.pointerType !== "mouse" && props.onReply && !selecting && !m.pending ? { x: e.clientX, y: e.clientY, active: null } : null;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (actionable) hold.onPointerMove(e);
    const s = swipe.current;
    if (!s || s.active === false) return;
    const dx = e.clientX - s.x;
    const dy = Math.abs(e.clientY - s.y);
    if (s.active === null) {
      if (Math.abs(dx) < SWIPE_START_PX && dy < SWIPE_START_PX) return;
      // Идёт выделение текста (ручки выделения на телефоне) — сообщение не двигаем.
      s.active = !hasTextSelection() && Math.abs(dx) > dy && dx < 0;
      if (!s.active) return;
    } else if (hasTextSelection()) {
      resetSwipe();
      return;
    }
    const shift = Math.min(SWIPE_MAX_PX, Math.max(0, -dx));
    const row = rowRef.current;
    if (!row) return;
    row.style.transform = `translateX(${-shift}px)`;
    row.classList.toggle(styles.swipeReady!, shift >= SWIPE_REPLY_PX);
  };
  const onPointerUp = (e: PointerEvent) => {
    hold.onPointerUp();
    const s = swipe.current;
    resetSwipe();
    if (s?.active) {
      if (s.x - e.clientX >= SWIPE_REPLY_PX) props.onReply?.(m);
      return;
    }
    if (m.pending || selecting || !props.onOpenReactions || e.button !== 0 || (e.target as Element).closest?.(NO_HOLD)) {
      lastTap.current.at = 0;
      return;
    }
    const prev = lastTap.current;
    const now = Date.now();
    if (now - prev.at < DOUBLE_TAP_MS && Math.abs(e.clientX - prev.x) < DOUBLE_TAP_PX && Math.abs(e.clientY - prev.y) < DOUBLE_TAP_PX) {
      lastTap.current = { at: 0, x: 0, y: 0 };
      // Двойной клик мышью выделяет слово — снимаем выделение.
      if (e.pointerType === "mouse") window.getSelection?.()?.removeAllRanges();
      props.onOpenReactions(m, { x: e.clientX, y: e.clientY });
    } else {
      lastTap.current = { at: now, x: e.clientX, y: e.clientY };
    }
  };

  const selectable = selecting && !!onToggleSelect;
  const rowClass = [styles.row, out ? styles.rowOut : "", selectable ? styles.selecting : "", selectable && props.selected ? styles.selectedRow : ""].filter(Boolean).join(" ");

  return (
    <div
      ref={rowRef}
      className={rowClass}
      data-message-id={m.id}
      onContextMenu={onContextMenu}
      onClickCapture={onClickCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        hold.onPointerCancel();
        resetSwipe();
      }}
      onPointerLeave={hold.onPointerLeave}
    >
      {selectable ? (
        <button
          type="button"
          className={props.selected ? `${styles.selectMark} ${styles.selectMarkOn}` : styles.selectMark}
          aria-pressed={!!props.selected}
          aria-label={props.selected ? "Убрать из выбранных" : "Выбрать"}
        >
          {props.selected ? <Icon name="Check" size={13} /> : null}
        </button>
      ) : null}
      {showAvatar !== undefined ? (
        <span className={styles.avatarSlot}>
          {showAvatar && sender ? <Avatar size={34} name={sender.name} color={sender.avatarColor} image={sender.avatarImage} /> : null}
        </span>
      ) : null}
      {keyboardOf(m.keyboard).length ? (
        <div className={styles.column}>
          <div ref={bubbleRef} className={bubbleClass}>
            {body}
          </div>
          <MessageKeyboard message={m} />
        </div>
      ) : (
        <div ref={bubbleRef} className={bubbleClass}>
          {body}
        </div>
      )}
      {!m.pending && !selecting && (props.onReply || props.onOpenMenu) ? (
        <span className={styles.actions}>
          {props.onReply ? (
            <button type="button" className={styles.actionButton} title="Ответить" onPointerDown={remember} onClick={() => props.onReply?.(m, takeQuote())}>
              <Icon name="Reply" size={16} />
            </button>
          ) : null}
          {props.onOpenMenu ? (
            <button
              type="button"
              className={styles.actionButton}
              title="Ещё"
              onPointerDown={remember}
              onClick={(e) => props.onOpenMenu?.(m, { x: e.clientX, y: e.clientY }, takeQuote())}
            >
              <Icon name="More" size={16} />
            </button>
          ) : null}
        </span>
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

/** На реакции — до трёх аватарок поставивших, как reactionsRow в messageBubble.js. */
const PILL_AVATARS = 3;

type PillProps = {
  reaction: Reaction;
  own: boolean;
  play: boolean;
  disabled: boolean;
  userOf?: (userId: string) => MessageSender | null;
  onReact: () => void;
  onDetails?: (at: Point) => void;
};

function ReactionPill({ reaction: r, own, play, disabled, userOf, onReact, onDetails }: PillProps) {
  const hold = useLongPress((at) => onDetails?.(at));
  const avatars = userOf
    ? r.userIds
        .slice(0, PILL_AVATARS)
        .map(userOf)
        .filter((u): u is MessageSender => !!u)
    : [];
  const sticker = !!reactionSticker(r.emoji);
  return (
    <button
      type="button"
      className={[styles.reaction, own ? styles.reactionMine : "", sticker ? styles.reactionSticker : ""].filter(Boolean).join(" ")}
      aria-pressed={own}
      aria-label={`${r.emoji} ${r.userIds.length}`}
      disabled={disabled}
      {...(onDetails ? { onPointerDown: hold.onPointerDown, onPointerMove: hold.onPointerMove, onPointerUp: hold.onPointerUp, onPointerCancel: hold.onPointerCancel, onPointerLeave: hold.onPointerLeave } : {})}
      onContextMenu={(e) => {
        if (!onDetails) return;
        e.preventDefault();
        e.stopPropagation();
        if (!hold.swallow(e)) onDetails({ x: e.clientX, y: e.clientY });
      }}
      onClick={(e) => {
        if (!hold.swallow(e)) onReact();
      }}
    >
      <span className={styles.reactionGlyph}>
        <ReactionGlyph emoji={r.emoji} play={play} />
      </span>
      {avatars.length ? (
        <span className={styles.reactionAvatars}>
          {avatars.map((u) => (
            <span key={u.id} className={styles.reactionAvatar} title={u.name}>
              <Avatar size={16} name={u.name} color={u.avatarColor} image={u.avatarImage} />
            </span>
          ))}
        </span>
      ) : null}
      <span className={styles.reactionCount}>{r.userIds.length}</span>
    </button>
  );
}
