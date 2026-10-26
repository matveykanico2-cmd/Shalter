import { useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type PointerEvent, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { isServerModerator, type SelfUser } from "@/entities/session";
import { closeStoryViewer, framesOf, storyApi, type StoryAuthor, type StoryComment, storyQueries, type StoryViewerRequest } from "@/entities/story";
import { openUserProfile } from "@/entities/user";

import { useWsEvent } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Avatar, Icon, toast } from "@/shared/ui";

import { sendStoryReply } from "../api/story-reply";
import { initViewer, viewerReducer } from "../model/viewer-state";

import styles from "./story-viewer.module.css";

const IMAGE_DURATION_MS = 5000;
const HOLD_MS = 220;
const SWIPE_MIN = 60;

function timeAgo(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин`;
  return `${Math.floor(min / 60)} ч`;
}

/** «Палец вверх» лайка истории (THUMB_SVG в storyViewer.js). */
function Thumb() {
  return (
    <svg className={styles.thumb} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 10.5V20H5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1h2zm2.2-.3l3.6-5.4a1.4 1.4 0 0 1 2.5 1l-.7 3.7a.7.7 0 0 0 .7.8H19a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 20H9.2z" />
    </svg>
  );
}

/** Просмотр историй поверх приложения — как openStoryViewer в public/js/components/storyViewer.js. */
export function StoryViewer({ request, me }: { request: StoryViewerRequest; me: SelfUser }) {
  const [s, dispatch] = useReducer(viewerReducer, request, initViewer);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  // held — пауза удержанием или пробелом (шапка и подвал прячутся); typing — фокус в поле ответа или комментария.
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState("");
  const [replyNote, setReplyNote] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [videoFailed, setVideoFailed] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);

  const group = s.groups[s.gi];
  const frames = framesOf(group);
  const frame = frames[s.si];
  const story = frame?.story;
  const frameKey = frame ? `${frame.story.id}:${frame.index}` : "";
  const author = group?.user;
  const mine = !!story && (story.userId === me.id || author?.id === me.id || !!(author && "canManage" in author && author.canManage));
  const moderator = isServerModerator(me);
  const paneOpen = s.commentsOpen || s.viewersOpen;
  const running = !held && !paneOpen && !typing;
  const isVideo = frame?.item.kind === "video";

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: storyQueries.baseKey });
    request.onChanged?.();
  };

  const gone = s.done || !frame;
  useEffect(() => {
    if (gone) closeStoryViewer();
  }, [gone]);

  // Фокус — в просмотр: иначе он оставался на кружке в полосе, и пробел открыл бы второй просмотр.
  useEffect(() => overlayRef.current?.focus(), []);

  // Новый кадр — поля и пауза с чистого листа.
  const [shownKey, setShownKey] = useState(frameKey);
  if (shownKey !== frameKey) {
    setShownKey(frameKey);
    setHeld(false);
    setReplyNote(null);
    setCommentText("");
  }

  // Просмотрено: отмечаем у себя сразу, на сервере — следом (markViewedIfNeeded).
  const storyId = story?.id;
  useEffect(() => {
    if (!story || story.expired || story.viewed || mine) return;
    dispatch({ type: "patchStory", storyId: story.id, patch: { viewed: true } });
    storyApi.view(story.id).then(changed, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз на историю
  }, [storyId]);

  // Видео: играет, пока ничто не держит историю; со звуком не дали — играем без звука.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;
    if (!running) {
      v.pause();
      return;
    }
    Promise.resolve(v.play?.()).catch(() => setMuted(true));
  }, [frameKey, running, isVideo, muted]);

  // Клавиатура телефона поднимает подвал (--kb), как onViewport в storyViewer.js.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewport = () => overlayRef.current?.style.setProperty("--kb", `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    vv.addEventListener("resize", onViewport);
    vv.addEventListener("scroll", onViewport);
    return () => {
      vv.removeEventListener("resize", onViewport);
      vv.removeEventListener("scroll", onViewport);
    };
  }, []);

  // Клавиши — как onKey: Esc, стрелки, пробел. Поля ввода и окна поверх (подтверждение) — свои.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t !== document.body && !overlayRef.current?.contains(t)) return;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "Escape") closeStoryViewer();
      else if (e.key === "ArrowRight") dispatch({ type: "next" });
      else if (e.key === "ArrowLeft") dispatch({ type: "prev" });
      else if (e.key === " ") {
        e.preventDefault();
        setHeld((h) => !h);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useWsEvent("story:deleted", ({ storyId: id }) => {
    if (!s.groups.some((g) => g.stories.some((st) => st.id === id))) return;
    dispatch({ type: "drop", storyId: id });
    request.onChanged?.();
  });
  useWsEvent("story:liked", ({ storyId: id, likeCount }) => dispatch({ type: "patchStory", storyId: id, patch: { likeCount } }));
  useWsEvent("story:commented", ({ storyId: id, comment }) => dispatch({ type: "comment", storyId: id, comment }));
  useWsEvent("story:comment-updated", ({ storyId: id, comment }) => dispatch({ type: "commentPatch", storyId: id, commentId: comment.id, patch: comment }));
  useWsEvent("story:comment-deleted", ({ storyId: id, commentId }) => dispatch({ type: "commentRemoved", storyId: id, commentId }));
  useWsEvent("story:comment-liked", ({ storyId: id, commentId, likeCount, likedByIds }) => dispatch({ type: "commentPatch", storyId: id, commentId, patch: { likeCount, likedByIds } }));

  if (!group || !frame || !story || !author) return null;

  const openAuthor = (who: { id: string; isChannel?: boolean } | null | undefined) => {
    if (!who?.id) return;
    closeStoryViewer();
    if (who.isChannel || who.id.startsWith("c_")) navigate(`/chat/${who.id}`);
    else openUserProfile(who.id);
  };

  const toggleComments = () => {
    if (!s.commentsOpen && s.comments === null) {
      const id = story.id;
      storyApi.comments(id).then(
        ({ comments }) => dispatch({ type: "comments", storyId: id, comments }),
        () => dispatch({ type: "comments", storyId: id, comments: [] })
      );
    }
    dispatch({ type: "toggleComments" });
  };

  const toggleViewers = () => {
    if (!s.viewersOpen && s.viewers === null) {
      const id = story.id;
      storyApi.viewers(id).then(
        ({ viewers }) => dispatch({ type: "viewers", storyId: id, viewers }),
        () => dispatch({ type: "viewers", storyId: id, viewers: [] })
      );
    }
    dispatch({ type: "toggleViewers" });
  };

  const toggleLike = async () => {
    if (story.expired) return;
    const before = { liked: !!story.liked, likeCount: story.likeCount ?? 0 };
    const liked = !before.liked;
    dispatch({ type: "patchStory", storyId: story.id, patch: { liked, likeCount: before.likeCount + (liked ? 1 : -1) } });
    if (liked) setBurst((n) => n + 1);
    try {
      const res = await storyApi.like(story.id);
      dispatch({ type: "patchStory", storyId: story.id, patch: { liked: res.liked, likeCount: res.likeCount } });
    } catch {
      dispatch({ type: "patchStory", storyId: story.id, patch: before });
    }
  };

  const editing = s.editingCommentId ? s.comments?.find((c) => c.id === s.editingCommentId) : null;

  const sendComment = async () => {
    const clean = commentText.trim();
    if (!clean) return;
    const id = story.id;
    if (editing) {
      try {
        const { comment } = await storyApi.editComment(id, editing.id, clean);
        dispatch({ type: "commentPatch", storyId: id, commentId: comment.id, patch: comment });
        dispatch({ type: "editComment", commentId: null });
        setCommentText("");
      } catch (err) {
        toast(errorText(err, "Не удалось сохранить комментарий"), { error: true });
      }
      return;
    }
    setCommentText("");
    try {
      const { comment } = await storyApi.addComment(id, clean, s.replyTo?.id ?? null);
      dispatch({ type: "comment", storyId: id, comment });
      dispatch({ type: "replyTo", to: null });
    } catch (err) {
      setCommentText(clean);
      toast(errorText(err, "Не удалось отправить комментарий"), { error: true });
    }
  };

  const toggleCommentLike = async (c: StoryComment) => {
    const id = story.id;
    const liked = (c.likedByIds ?? []).includes(me.id);
    const apply = (val: boolean) => {
      const ids = new Set(c.likedByIds ?? []);
      if (val) ids.add(me.id);
      else ids.delete(me.id);
      dispatch({ type: "commentPatch", storyId: id, commentId: c.id, patch: { likedByIds: [...ids], likeCount: ids.size } });
    };
    apply(!liked);
    try {
      const res = await storyApi.likeComment(id, c.id);
      dispatch({ type: "commentPatch", storyId: id, commentId: c.id, patch: { likedByIds: res.comment.likedByIds, likeCount: res.comment.likeCount } });
    } catch {
      apply(liked);
    }
  };

  const removeComment = async (c: StoryComment) => {
    const id = story.id;
    const question = c.userId === me.id ? "Удалить комментарий?" : `Удалить комментарий ${c.author?.name ?? "пользователя"}?`;
    if (!(await askConfirm(question, { okLabel: "Удалить", danger: true }))) return;
    try {
      await storyApi.removeComment(id, c.id);
      dispatch({ type: "commentRemoved", storyId: id, commentId: c.id });
    } catch (err) {
      toast(errorText(err, "Не удалось удалить комментарий"), { error: true });
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setReply("");
    try {
      await sendStoryReply(author, text, { url: frame.item.url ?? story.url, kind: frame.item.kind === "video" ? "video" : "image" });
      setReplyNote("Отправлено ✓");
      setTimeout(() => setReplyNote(null), 2000);
    } catch (err) {
      setReplyNote(errorText(err, "Не удалось отправить"));
    }
  };

  const deleteStory = async () => {
    setHeld(true);
    const count = story.items?.length ?? 1;
    const question = !mine
      ? `Удалить чужую историю «${author.name}» за нарушение правил? Автору придёт уведомление.`
      : count > 1
        ? `Удалить историю целиком — все ${count} кадра?`
        : "Удалить историю?";
    if (!(await askConfirm(question, { okLabel: "Удалить", danger: true }))) return setHeld(false);
    try {
      await storyApi.remove(story.id);
    } catch (err) {
      toast(errorText(err, "Не удалось удалить историю"), { error: true });
      return setHeld(false);
    }
    dispatch({ type: "drop", storyId: story.id });
    changed();
  };

  const tapZone = (onTap: () => void) => holdable(onTap, setHeld, (dir) => dispatch({ type: dir < 0 ? "nextGroup" : "prevGroup" }));

  const replyPlaceholder = replyNote ?? `Ответить ${author.name}…`;
  const viewsCount = story.viewedByIds?.length ?? s.viewers?.length ?? 0;

  const likeButton =
    !mine && !story.expired ? (
      <button type="button" className={story.liked ? `${styles.pill} ${styles.liked}` : styles.pill} title={story.liked ? "Убрать лайк" : "Нравится"} aria-label={story.liked ? "Убрать лайк" : "Нравится"} onClick={() => void toggleLike()}>
        <span key={burst} className={burst ? `${styles.heart} ${styles.pop}` : styles.heart}>
          <Thumb />
        </span>
        {story.likeCount ? ` ${story.likeCount}` : ""}
        {burst ? <Particles key={burst} /> : null}
      </button>
    ) : story.likeCount ? (
      <span className={styles.likeCount}>
        <Thumb /> {story.likeCount}
      </span>
    ) : null;

  const commentsButton = (
    <button type="button" className={styles.pill} title="Комментарии" aria-label="Комментарии" onClick={toggleComments}>
      <Icon name="MessageSquare" size={18} />
      {s.comments ? ` ${s.comments.length}` : ""}
    </button>
  );

  const freeze = { onFocus: () => setTyping(true), onBlur: () => setTyping(false) };

  return createPortal(
    <div ref={overlayRef} className={held ? `${styles.overlay} ${styles.paused}` : styles.overlay} role="dialog" aria-modal="true" aria-label="История" tabIndex={-1}>
      <div className={styles.shell}>
        <div className={styles.progressRow}>
          {frames.map((f, i) => (
            <div key={`${f.story.id}:${f.index}`} className={styles.progressBar}>
              {i < s.si ? (
                <div className={`${styles.fill} ${styles.fillDone}`} />
              ) : i === s.si ? (
                isVideo ? (
                  <div ref={fillRef} className={`${styles.fill} ${styles.fillVideo}`} />
                ) : (
                  <div
                    key={frameKey}
                    className={`${styles.fill} ${styles.fillRun}`}
                    style={{ animationDuration: `${IMAGE_DURATION_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                    onAnimationEnd={() => dispatch({ type: "next" })}
                  />
                )
              ) : (
                <div className={styles.fill} />
              )}
            </div>
          ))}
        </div>

        <div className={styles.header}>
          <button type="button" className={styles.authorLink} title={"isChannel" in author ? "Открыть канал" : "Открыть профиль"} onClick={() => openAuthor(asWho(author))}>
            <Avatar name={author.name ?? ""} color={author.avatarColor} image={author.avatarImage} size={32} />
          </button>
          <div className={styles.titles}>
            <p className={`${styles.name} ${styles.nameLink}`} onClick={() => openAuthor(asWho(author))}>
              {author.name}
            </p>
            <p className={styles.time}>{timeAgo(story.createdAt)}</p>
          </div>
          {isVideo ? (
            <button type="button" className={styles.headerButton} title={muted ? "Включить звук" : "Выключить звук"} aria-label={muted ? "Включить звук" : "Выключить звук"} onClick={() => setMuted((m) => !m)}>
              <Icon name={muted ? "BellOff" : "Bell"} size={18} />
            </button>
          ) : null}
          {mine || moderator ? (
            <button type="button" className={styles.headerButton} title={mine ? "Удалить" : "Удалить (модерация)"} aria-label={mine ? "Удалить" : "Удалить (модерация)"} onClick={() => void deleteStory()}>
              <Icon name="Trash" size={18} />
            </button>
          ) : null}
          <button type="button" className={styles.headerButton} title="Закрыть" aria-label="Закрыть" onClick={closeStoryViewer}>
            <Icon name="X" size={20} />
          </button>
        </div>

        {isVideo ? (
          videoFailed === frameKey ? (
            <div className={`${styles.media} ${styles.processing}`}>
              <span className={styles.spinner} />
              <p>Видео обрабатывается — откроется через минуту</p>
            </div>
          ) : (
            // Обработанное сервером видео (H.264, 1080p) открывается везде; пока его нет — оригинал.
            <video
              key={frameKey}
              ref={videoRef}
              className={styles.media}
              src={frame.item.previewUrl || frame.item.url}
              poster={frame.item.posterUrl}
              playsInline
              muted={muted}
              onEnded={() => dispatch({ type: "next" })}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (fillRef.current && v.duration) fillRef.current.style.width = `${(v.currentTime / v.duration) * 100}%`;
              }}
              // Оригинал в формате, который это устройство не играет (HEVC с iPhone и т. п.).
              onError={() => (frame.item.previewUrl ? undefined : setVideoFailed(frameKey))}
            />
          )
        ) : (
          <img key={frameKey} className={styles.media} src={frame.item.url} alt="" />
        )}

        <div className={styles.tapZones}>
          <div className={styles.tapZone} {...tapZone(() => dispatch({ type: "prev" }))} />
          <div className={styles.tapZone} {...tapZone(() => dispatch({ type: "next" }))} />
        </div>

        <div className={styles.footer}>
          {mine ? (
            <button type="button" className={styles.pill} onClick={toggleViewers}>
              <Icon name="Users" size={16} /> {viewsCount} просмотров
            </button>
          ) : s.commentsOpen ? null : (
            <>
              <input
                className={styles.replyInput}
                placeholder={replyPlaceholder}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendReply();
                  e.stopPropagation();
                }}
                {...freeze}
              />
              <button type="button" className={styles.sendButton} aria-label="Отправить" onClick={() => void sendReply()}>
                <Icon name="Send" size={18} />
              </button>
            </>
          )}
          {likeButton}
          {commentsButton}
        </div>

        {mine && s.viewersOpen ? (
          <div className={styles.panel}>
            <p className={styles.panelTitle}>{s.viewers === null ? "Загружаем…" : s.viewers.length ? "Смотрели" : "Пока никто не смотрел"}</p>
            {(s.viewers ?? []).map((u) => (
              <button key={u.id} type="button" className={styles.viewerRow} title="Открыть профиль" onClick={() => openAuthor(u)}>
                <Avatar name={u.name ?? ""} color={u.avatarColor} image={u.avatarImage} size={30} />
                <span>{u.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {s.commentsOpen ? (
          <div className={`${styles.panel} ${styles.commentsPanel}`}>
            <div className={styles.commentsList}>
              {s.comments === null ? <p className={styles.panelTitle}>Загружаем…</p> : !s.comments.length ? <p className={styles.panelTitle}>Пока нет комментариев</p> : null}
              {threaded(s.comments ?? []).map(({ comment: c, isReply }) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  isReply={isReply}
                  meId={me.id}
                  editing={c.id === s.editingCommentId}
                  canDelete={c.userId === me.id || mine || moderator}
                  onAuthor={() => openAuthor({ id: c.author?.id ?? c.userId })}
                  onLike={() => void toggleCommentLike(c)}
                  onReply={() => {
                    dispatch({ type: "replyTo", to: { id: c.parentId ?? c.id, author: c.author } });
                    commentInputRef.current?.focus();
                  }}
                  onEdit={() => {
                    dispatch({ type: "editComment", commentId: c.id });
                    setCommentText(c.text);
                    commentInputRef.current?.focus();
                  }}
                  onDelete={() => void removeComment(c)}
                />
              ))}
            </div>
            {editing ? (
              <div className={styles.editingBar}>
                <Icon name="Edit" size={13} />
                <span className={styles.editingText}>Изменение: {editing.text}</span>
                <button type="button" className={styles.commentAction} title="Отменить" aria-label="Отменить" onClick={() => (dispatch({ type: "editComment", commentId: null }), setCommentText(""))}>
                  <Icon name="X" size={14} />
                </button>
              </div>
            ) : s.replyTo ? (
              <div className={styles.editingBar}>
                <Icon name="MessageSquare" size={13} />
                <span className={styles.editingText}>Ответ {s.replyTo.author?.name ?? "пользователю"}</span>
                <button type="button" className={styles.commentAction} title="Отменить" aria-label="Отменить" onClick={() => dispatch({ type: "replyTo", to: null })}>
                  <Icon name="X" size={14} />
                </button>
              </div>
            ) : null}
            <div className={styles.compose}>
              <input
                ref={commentInputRef}
                className={styles.commentInput}
                placeholder={editing ? "Изменить комментарий…" : "Комментарий…"}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendComment();
                  if (e.key === "Escape" && editing) {
                    dispatch({ type: "editComment", commentId: null });
                    setCommentText("");
                  }
                  e.stopPropagation();
                }}
                {...freeze}
              />
              <button type="button" className={styles.sendButton} aria-label="Отправить комментарий" onClick={() => void sendComment()}>
                <Icon name="Send" size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {s.gi > 0 ? (
        <button type="button" className={`${styles.nav} ${styles.navPrev}`} aria-label="Предыдущие истории" onClick={() => dispatch({ type: "prevGroup" })}>
          <Icon name="ChevronLeft" size={22} />
        </button>
      ) : null}
      {s.gi < s.groups.length - 1 ? (
        <button type="button" className={`${styles.nav} ${styles.navNext}`} aria-label="Следующие истории" onClick={() => dispatch({ type: "nextGroup" })}>
          <Icon name="ChevronRight" size={22} />
        </button>
      ) : null}
    </div>,
    document.body
  );
}

const asWho = (author: StoryAuthor) => ({ id: author.id, isChannel: "isChannel" in author ? author.isChannel : false });

/** Ветки: верхний комментарий, под ним ответы на него. */
function threaded(all: StoryComment[]) {
  return all
    .filter((c) => !c.parentId)
    .flatMap((top) => [{ comment: top, isReply: false }, ...all.filter((c) => c.parentId === top.id).map((comment) => ({ comment, isReply: true }))]);
}

/** Удержание — пауза, короткое нажатие — кадр вперёд/назад, свайп в сторону — другой автор. */
function holdable(onTap: () => void, setHeld: (held: boolean) => void, onSwipe: (dir: number) => void) {
  let held = false;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let downX = 0;
  let downY = 0;
  return {
    onPointerDown: (e: PointerEvent) => {
      held = false;
      downX = e.clientX;
      downY = e.clientY;
      holdTimer = setTimeout(() => {
        held = true;
        setHeld(true);
      }, HOLD_MS);
    },
    onPointerUp: (e: PointerEvent) => {
      clearTimeout(holdTimer);
      if (held) return setHeld(false);
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.4) return onSwipe(dx);
      onTap();
    },
    onPointerLeave: () => {
      clearTimeout(holdTimer);
      if (held) setHeld(false);
    },
  };
}

/** Россыпь 👍 над кнопкой лайка (burstLike). */
function Particles() {
  const [items] = useState(() => Array.from({ length: 6 }, () => ({ dx: (Math.random() * 2 - 1) * 44, rot: (Math.random() * 2 - 1) * 50 })));
  return items.map((p, i) => (
    <span key={i} className={styles.particle} style={{ "--dx": `${p.dx}px`, "--rot": `${p.rot}deg`, animationDelay: `${i * 0.03}s` } as CSSProperties} aria-hidden="true">
      👍
    </span>
  ));
}

type CommentRowProps = {
  comment: StoryComment;
  isReply: boolean;
  meId: string;
  editing: boolean;
  canDelete: boolean;
  onAuthor: () => void;
  onLike: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function CommentRow({ comment: c, isReply, meId, editing, canDelete, onAuthor, onLike, onReply, onEdit, onDelete }: CommentRowProps) {
  const liked = (c.likedByIds ?? []).includes(meId);
  return (
    <div className={[styles.commentRow, editing ? styles.commentEditing : "", isReply ? styles.commentReply : ""].filter(Boolean).join(" ")}>
      <button type="button" className={styles.authorLink} title="Открыть профиль" onClick={onAuthor}>
        <Avatar name={c.author?.name ?? "?"} color={c.author?.avatarColor} image={c.author?.avatarImage} size={26} />
      </button>
      <div className={styles.commentBody}>
        <span className={`${styles.commentAuthor} ${styles.nameLink}`} onClick={onAuthor}>
          {c.author?.name ?? "Пользователь"}
        </span>
        <span className={styles.commentText}>
          {c.text}
          {c.editedAt ? <span className={styles.edited}> · изм.</span> : null}
        </span>
        <div className={styles.commentMeta}>
          <button type="button" className={liked ? `${styles.commentLike} ${styles.commentLiked}` : styles.commentLike} title={liked ? "Убрать лайк" : "Нравится"} onClick={onLike}>
            <span>{liked ? "❤️" : "🤍"}</span>
            {c.likeCount ? <span className={styles.commentLikeCount}> {c.likeCount}</span> : null}
          </button>
          <button type="button" className={styles.commentLike} onClick={onReply}>
            Ответить
          </button>
        </div>
      </div>
      <div className={styles.commentActions}>
        {c.userId === meId ? (
          <button type="button" className={styles.commentAction} title="Изменить" onClick={onEdit}>
            <Icon name="Edit" size={14} />
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className={`${styles.commentAction} ${styles.danger}`} title="Удалить" onClick={onDelete}>
            <Icon name="Trash" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
