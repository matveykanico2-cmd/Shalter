import { askConfirm } from "./confirmDialog.js";
import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";
import { isServerModerator } from "../lib/moderation.js";
import { openProfileDialog } from "./profileDialog.js";

const IMAGE_DURATION_MS = 5000;

const THUMB_SVG =
  '<svg class="story-thumb-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path d="M7 10.5V20H5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1h2zm2.2-.3l3.6-5.4a1.4 1.4 0 0 1 2.5 1l-.7 3.7a.7.7 0 0 0 .7.8H19a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 20H9.2z"/>' +
  "</svg>";

export function openStoryViewer(groups, groupIndex, meId, onChanged, startIndex = 0) {
  let gi = groupIndex;
  let si = Math.max(0, startIndex);
  let timer = null;
  let startedAt = 0;
  let remainingMs = IMAGE_DURATION_MS;
  let paused = false;
  let muted = false;
  let videoEl = null;
  let likeBtnEl = null;
  let viewers = null;
  let viewersOpen = false;
  let comments = null;
  let commentsOpen = false;
  let editingCommentId = null;
  let replyToComment = null;

  const overlay = el("div", { class: "story-viewer-overlay" });
  document.body.appendChild(overlay);

  const vv = window.visualViewport;
  function onViewport() {
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    overlay.style.setProperty("--kb", `${kb}px`);
  }
  vv?.addEventListener("resize", onViewport);
  vv?.addEventListener("scroll", onViewport);

  const currentGroup = () => groups[gi];

  function frames() {
    const group = currentGroup();
    if (!group) return [];
    return group.stories.flatMap((story) =>
      (story.items?.length ? story.items : [{ kind: story.kind, url: story.url }]).map((item, index) => ({ story, item, index }))
    );
  }
  const currentFrame = () => frames()[si];
  const currentStory = () => currentFrame()?.story;
  const isMine = () => currentStory()?.userId === meId || currentGroup()?.user?.id === meId || !!currentGroup()?.user?.canManage;

  let closed = false;
  function close() {
    closed = true;
    clearTimeout(timer);
    videoEl?.pause();
    document.removeEventListener("keydown", onKey);
    unsubDeleted?.();
    unsubLiked?.();
    unsubCommented?.();
    unsubCommentUpdated?.();
    unsubCommentDeleted?.();
    unsubCommentLiked?.();
    vv?.removeEventListener("resize", onViewport);
    vv?.removeEventListener("scroll", onViewport);
    overlay.remove();
  }

  function openAuthor(author) {
    if (!author?.id) return;
    close();
    if (author.isChannel || String(author.id).startsWith("c_")) navigate(`/chat/${author.id}`);
    else openProfileDialog(author.id);
  }

  function timeAgo(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return "только что";
    if (min < 60) return `${min} мин`;
    return `${Math.floor(min / 60)} ч`;
  }

  function resetStoryPanels() {
    comments = null;
    commentsOpen = false;
    editingCommentId = null;
    replyToComment = null;
    viewers = null;
    viewersOpen = false;
  }

  function goNextStory() {
    if (si < frames().length - 1) {
      si++;
      resetStoryPanels();
      render();
    } else goNextGroup();
  }

  function goPrevStory() {
    if (si > 0) {
      si--;
      resetStoryPanels();
      render();
    } else if (gi > 0) {
      gi--;
      si = Math.max(0, frames().length - 1);
      render();
    }
  }

  function goNextGroup() {
    if (gi < groups.length - 1) {
      gi++;
      si = 0;
      viewers = null;
      viewersOpen = false;
      comments = null;
      commentsOpen = false;
      editingCommentId = null;
      render();
    } else close();
  }

  function goPrevGroup() {
    if (gi > 0) {
      gi--;
      si = 0;
      viewers = null;
      viewersOpen = false;
      comments = null;
      commentsOpen = false;
      editingCommentId = null;
      render();
    }
  }

  function startTimer(ms) {
    clearTimeout(timer);
    remainingMs = ms;
    startedAt = Date.now();
    paused = false;
    timer = setTimeout(goNextStory, ms);
    setBarAnimation(ms, false);
  }

  function pause() {
    if (paused) return;
    paused = true;
    clearTimeout(timer);
    remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    videoEl?.pause();
    setBarAnimation(0, true);
    overlay.classList.add("paused");
  }

  function resume() {
    if (!paused) return;
    overlay.classList.remove("paused");
    if (videoEl) {
      videoEl.play().catch(() => {});
      paused = false;
      setBarAnimation(0, false);
      return;
    }
    startTimer(remainingMs);
  }

  function freeze() {
    clearTimeout(timer);
    videoEl?.pause();
  }
  function unfreeze() {
    if (paused || commentsOpen || viewersOpen) return;
    if (videoEl) videoEl.play().catch(() => {});
    else startTimer(IMAGE_DURATION_MS);
  }

  let activeFill = null;
  function setBarAnimation(ms, freeze) {
    if (!activeFill) return;
    if (freeze) {
      const w = activeFill.getBoundingClientRect().width;
      const total = activeFill.parentElement.getBoundingClientRect().width || 1;
      activeFill.style.transition = "none";
      activeFill.style.width = `${(w / total) * 100}%`;
      return;
    }
    if (ms > 0) {
      activeFill.style.transition = "none";
      activeFill.style.width = "0%";
      requestAnimationFrame(() => {
        activeFill.style.transition = `width ${ms}ms linear`;
        activeFill.style.width = "100%";
      });
    } else {
      const left = videoEl ? Math.max(0, (videoEl.duration - videoEl.currentTime) * 1000) : remainingMs;
      activeFill.style.transition = `width ${left}ms linear`;
      activeFill.style.width = "100%";
    }
  }

  async function markViewedIfNeeded(story) {
    if (story.expired) return;
    if (story.viewed || isMine()) return;
    story.viewed = true;
    onChanged?.();
    await api.viewStory(story.id).catch(() => {});
  }

  async function loadViewers() {
    const story = currentStory();
    try {
      ({ viewers } = await api.getStoryViewers(story.id));
    } catch {
      viewers = [];
    }
    render();
  }

  async function loadComments() {
    const story = currentStory();
    try {
      ({ comments } = await api.getStoryComments(story.id));
    } catch {
      comments = [];
    }
    render();
  }

  function refreshLikeButton() {
    const story = currentStory();
    if (!likeBtnEl || !story) return;
    likeBtnEl.className = `story-like-btn ${story.liked ? "liked" : ""}`;
    likeBtnEl.title = story.liked ? "Убрать лайк" : "Нравится";
    let inner = likeBtnEl.querySelector(".story-like-inner");
    if (!inner) {
      inner = el("span", { class: "story-like-inner" });
      likeBtnEl.prepend(inner);
    }
    clear(inner);
    inner.append(el("span", { class: "story-like-heart", html: THUMB_SVG }));
    if (story.likeCount) inner.append(` ${story.likeCount}`);
  }

  function burstLike() {
    if (!likeBtnEl) return;
    const heart = likeBtnEl.querySelector(".story-like-heart");
    if (heart) { heart.classList.remove("pop"); void heart.offsetWidth; heart.classList.add("pop"); }
    for (let i = 0; i < 6; i++) {
      const p = el("span", { class: "like-particle" }, "👍");
      p.style.setProperty("--dx", `${(Math.random() * 2 - 1) * 44}px`);
      p.style.setProperty("--rot", `${(Math.random() * 2 - 1) * 50}deg`);
      p.style.animationDelay = `${i * 0.03}s`;
      likeBtnEl.appendChild(p);
      setTimeout(() => p.remove(), 950);
    }
  }

  async function toggleLike() {
    const story = currentStory();
    if (!story || story.expired) return;
    const before = { liked: !!story.liked, likeCount: story.likeCount ?? 0 };
    story.liked = !before.liked;
    story.likeCount = before.likeCount + (story.liked ? 1 : -1);
    refreshLikeButton();
    if (story.liked) burstLike();
    try {
      const res = await api.likeStory(story.id);
      story.liked = res.liked;
      story.likeCount = res.likeCount;
      refreshLikeButton();
    } catch {
      story.liked = before.liked;
      story.likeCount = before.likeCount;
      refreshLikeButton();
    }
  }

  async function sendComment(text, input) {
    const story = currentStory();
    const clean = text.trim();
    if (!clean) return;
    if (editingCommentId) return saveCommentEdit(editingCommentId, clean, input);
    input.value = "";
    const parentId = replyToComment?.id ?? null;
    try {
      const { comment } = await api.addStoryComment(story.id, clean, parentId);
      if (comments && !comments.some((c) => c.id === comment.id)) comments = [...comments, comment];
      replyToComment = null;
      render();
    } catch (err) {
      input.value = clean;
      alert(err.message || "Не удалось отправить комментарий");
    }
  }

  async function toggleCommentLike(c) {
    if (!comments) return;
    const liked = (c.likedByIds ?? []).includes(meId);
    const nextLiked = !liked;
    const apply = (val) => {
      comments = comments.map((x) => {
        if (x.id !== c.id) return x;
        const ids = new Set(x.likedByIds ?? []);
        if (val) ids.add(meId);
        else ids.delete(meId);
        return { ...x, likedByIds: [...ids], likeCount: ids.size };
      });
    };
    apply(nextLiked);
    render();
    try {
      const res = await api.likeStoryComment(currentStory().id, c.id);
      comments = comments.map((x) => (x.id === c.id ? { ...x, likedByIds: res.comment.likedByIds, likeCount: res.comment.likeCount } : x));
      render();
    } catch {
      apply(liked);
      render();
    }
  }

  async function saveCommentEdit(commentId, text, input) {
    const story = currentStory();
    try {
      const { comment } = await api.editStoryComment(story.id, commentId, text);
      comments = (comments ?? []).map((c) => (c.id === comment.id ? comment : c));
      editingCommentId = null;
      input.value = "";
      render();
    } catch (err) {
      alert(err.message || "Не удалось сохранить комментарий");
    }
  }

  function canDeleteComment(c) {
    return c.userId === meId || isMine() || isServerModerator();
  }

  async function removeComment(c) {
    const story = currentStory();
    const question = c.userId === meId ? "Удалить комментарий?" : `Удалить комментарий ${c.author?.name ?? "пользователя"}?`;
    if (!(await askConfirm(question))) return;
    try {
      await api.deleteStoryComment(story.id, c.id);
      comments = (comments ?? []).filter((x) => x.id !== c.id);
      if (editingCommentId === c.id) editingCommentId = null;
      render();
    } catch (err) {
      alert(err.message || "Не удалось удалить комментарий");
    }
  }

  async function sendReply(text, input) {
    const group = currentGroup();
    if (!text.trim()) return;
    input.value = "";
    try {
      const { chat } = await api.startDm(group.user.id, group.user.name, group.user.avatarColor);
      const frame = currentFrame();
      const storyReply = {
        url: frame?.item?.url ?? currentStory()?.url,
        kind: frame?.item?.kind === "video" ? "video" : "image",
        authorName: group.user.name,
      };
      await api.sendMessage(chat.id, text.trim(), { storyReply });
      input.placeholder = "Отправлено ✓";
      setTimeout(() => (input.placeholder = `Ответить ${group.user.name}…`), 2000);
    } catch (err) {
      input.placeholder = err.message || "Не удалось отправить";
    }
  }

  function dropStory(storyId) {
    if (closed) return;
    const was = currentFrame();
    for (const group of groups) group.stories = group.stories.filter((st) => st.id !== storyId);
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].stories.length) continue;
      groups.splice(i, 1);
      if (i < gi) gi--;
    }
    if (!groups.length) return close();
    if (gi >= groups.length) gi = groups.length - 1;

    const list = frames();
    if (!list.length) return close();
    const same = was ? list.findIndex((f) => f.story.id === was.story.id && f.index === was.index) : -1;
    si = same >= 0 ? same : Math.min(si, list.length - 1);
    render();
  }

  const unsubDeleted = onWsMessage("story:deleted", ({ storyId }) => {
    if (!groups.some((g) => g.stories.some((st) => st.id === storyId))) return;
    dropStory(storyId);
    onChanged?.();
  });

  const unsubLiked = onWsMessage("story:liked", ({ storyId, likeCount }) => {
    for (const group of groups) {
      const story = group.stories.find((st) => st.id === storyId);
      if (story) story.likeCount = likeCount;
    }
    if (currentStory()?.id === storyId) refreshLikeButton();
  });

  const isTypingHere = () => {
    const a = document.activeElement;
    return a && overlay.contains(a) && (a.classList.contains("story-comment-input") || a.classList.contains("story-reply-input"));
  };

  const unsubCommented = onWsMessage("story:commented", ({ storyId, comment }) => {
    if (currentStory()?.id !== storyId) return;
    if (comments && !comments.some((c) => c.id === comment.id)) {
      comments = [...comments, comment];
      if (commentsOpen && !isTypingHere()) render();
    }
  });

  const unsubCommentUpdated = onWsMessage("story:comment-updated", ({ storyId, comment }) => {
    if (currentStory()?.id !== storyId || !comments) return;
    comments = comments.map((c) => (c.id === comment.id ? comment : c));
    if (commentsOpen && !isTypingHere()) render();
  });
  const unsubCommentDeleted = onWsMessage("story:comment-deleted", ({ storyId, commentId }) => {
    if (currentStory()?.id !== storyId || !comments) return;
    comments = comments.filter((c) => c.id !== commentId);
    if (editingCommentId === commentId) editingCommentId = null;
    if (commentsOpen && !isTypingHere()) render();
  });
  const unsubCommentLiked = onWsMessage("story:comment-liked", ({ storyId, commentId, likeCount, likedByIds }) => {
    if (currentStory()?.id !== storyId || !comments) return;
    comments = comments.map((c) => (c.id === commentId ? { ...c, likeCount, likedByIds: likedByIds ?? c.likedByIds } : c));
    if (commentsOpen && !isTypingHere()) render();
  });

  function onKey(e) {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowRight") return goNextStory();
    if (e.key === "ArrowLeft") return goPrevStory();
    if (e.key === " ") {
      e.preventDefault();
      paused ? resume() : pause();
    }
  }
  document.addEventListener("keydown", onKey);

  function render() {
    // Просмотр уже закрыт (например, пока висело подтверждение) — не оживляем его
    // в отсоединённом оверлее: таймеры и звук видео шли бы невидимо.
    if (closed) return;
    clearTimeout(timer);
    videoEl?.pause();
    const group = currentGroup();
    const frame = currentFrame();
    const story = frame?.story;
    if (!group || !story) return close();

    markViewedIfNeeded(story);
    const mine = isMine();

    const fills = [];
    const bars = frames().map((f, i) => {
      const fill = el("div", { class: `story-progress-fill ${i < si ? "done" : ""}` });
      fills.push(fill);
      return el("div", { class: "story-progress-bar" }, [fill]);
    });
    activeFill = fills[si];

    let media;
    if (frame.item.kind === "video") {
      videoEl = el("video", {
        src: frame.item.url,
        class: "story-media",
        autoplay: true,
        playsinline: true,
        muted,
        onended: goNextStory,
        onloadedmetadata: () => setBarAnimation(0, false),
      });
      media = videoEl;
    } else {
      videoEl = null;
      media = el("img", { src: frame.item.url, class: "story-media" });
    }

    const replyInput = el("input", {
      class: "story-reply-input",
      placeholder: `Ответить ${group.user.name}…`,
      onfocus: freeze,
      onblur: unfreeze,
      onkeydown: (e) => {
        if (e.key === "Enter") sendReply(e.target.value, e.target);
        e.stopPropagation();
      },
    });

    const editing = editingCommentId ? comments?.find((c) => c.id === editingCommentId) : null;
    const commentInput = el("input", {
      class: "story-comment-input",
      placeholder: editing ? "Изменить комментарий…" : "Комментарий…",
      value: editing?.text ?? "",
      onfocus: freeze,
      onblur: unfreeze,
      onkeydown: (e) => {
        if (e.key === "Enter") sendComment(e.target.value, e.target);
        if (e.key === "Escape" && editingCommentId) {
          editingCommentId = null;
          render();
        }
        e.stopPropagation();
      },
    });

    const likeBtn = !mine && !story.expired
      ? el(
          "button",
          {
            class: `story-like-btn ${story.liked ? "liked" : ""}`,
            title: story.liked ? "Убрать лайк" : "Нравится",
            onclick: toggleLike,
          },
          [el("span", { class: "story-like-inner" }, [el("span", { class: "story-like-heart", html: THUMB_SVG }), story.likeCount ? ` ${story.likeCount}` : ""])]
        )
      : story.likeCount
        ? el("span", { class: "story-like-count", html: `${THUMB_SVG} ${story.likeCount}` })
        : null;
    likeBtnEl = likeBtn && likeBtn.tagName === "BUTTON" ? likeBtn : null;

    const commentsBtn = el(
      "button",
      {
        class: "story-comments-btn",
        title: "Комментарии",
        onclick: () => {
          commentsOpen = !commentsOpen;
          if (commentsOpen) {
            viewersOpen = false;
            if (comments === null) loadComments();
            else render();
          } else render();
        },
      },
      [el("span", { html: iconSvg("MessageSquare", 18) }), comments ? ` ${comments.length}` : ""]
    );

    const footer = mine
      ? el("div", { class: "story-footer" }, [
          el(
            "button",
            {
              class: "story-viewers-btn",
              onclick: () => {
                viewersOpen = !viewersOpen;
                commentsOpen = false;
                if (viewersOpen && viewers === null) loadViewers();
                else render();
              },
            },
            [el("span", { html: iconSvg("Users", 16) }), ` ${story.viewedByIds?.length ?? viewers?.length ?? 0} просмотров`]
          ),
          likeBtn,
          commentsBtn,
        ])
      : el(
          "div",
          { class: "story-footer" },
          [
            commentsOpen ? null : replyInput,
            commentsOpen
              ? null
              : el("button", { class: "story-send-btn", html: iconSvg("Send", 18), onclick: () => sendReply(replyInput.value, replyInput) }),
            likeBtn,
            commentsBtn,
          ].filter(Boolean)
        );

    const commentRow = (c, isReply) => {
      const liked = (c.likedByIds ?? []).includes(meId);
      return el("div", { class: `story-comment-row${c.id === editingCommentId ? " editing" : ""}${isReply ? " is-reply" : ""}` }, [
        el("button", { class: "story-author-link", title: "Открыть профиль", onclick: () => openAuthor({ id: c.author?.id ?? c.userId }) }, [
          Avatar({ name: c.author?.name ?? "?", color: c.author?.avatarColor, image: c.author?.avatarImage, size: 26 }),
        ]),
        el("div", { class: "story-comment-body" }, [
          el("span", { class: "story-comment-author story-author-name-link", onclick: () => openAuthor({ id: c.author?.id ?? c.userId }) }, c.author?.name ?? "Пользователь"),
          el("span", { class: "story-comment-text" }, [c.text, c.editedAt ? el("span", { class: "comment-edited" }, " · изм.") : null]),
          el("div", { class: "story-comment-meta" }, [
            el(
              "button",
              { class: `comment-like-btn ${liked ? "liked" : ""}`, title: liked ? "Убрать лайк" : "Нравится", onclick: () => toggleCommentLike(c) },
              [el("span", {}, liked ? "❤️" : "🤍"), c.likeCount ? el("span", { class: "comment-like-count" }, ` ${c.likeCount}`) : null]
            ),
            el("button", { class: "comment-reply-btn", onclick: () => {
              replyToComment = { id: c.parentId ?? c.id, author: c.author };
              render();
              overlay.querySelector(".story-comment-input")?.focus();
            } }, "Ответить"),
          ]),
        ]),
        el("div", { class: "comment-actions" }, [
          c.userId === meId
            ? el("button", { class: "comment-action-btn", title: "Изменить", html: iconSvg("Edit", 14), onclick: () => { editingCommentId = c.id; render(); overlay.querySelector(".story-comment-input")?.focus(); } })
            : null,
          canDeleteComment(c)
            ? el("button", { class: "comment-action-btn danger", title: "Удалить", html: iconSvg("Trash", 14), onclick: () => removeComment(c) })
            : null,
        ]),
      ]);
    };

    const all = comments ?? [];
    const tops = all.filter((c) => !c.parentId);
    const repliesOf = (id) => all.filter((c) => c.parentId === id);
    const threadNodes = [];
    for (const top of tops) {
      threadNodes.push(commentRow(top, false));
      for (const r of repliesOf(top.id)) threadNodes.push(commentRow(r, true));
    }

    const commentsPanel = commentsOpen
      ? el("div", { class: "story-comments-panel" }, [
          el("div", { class: "story-comments-list" }, [
            comments === null
              ? el("p", { class: "story-viewers-title" }, "Загружаем…")
              : !all.length
                ? el("p", { class: "story-viewers-title" }, "Пока нет комментариев")
                : null,
            ...threadNodes,
          ]),
          editing
            ? el("div", { class: "comment-editing-bar" }, [
                el("span", { html: iconSvg("Edit", 13) }),
                el("span", { class: "comment-editing-text" }, `Изменение: ${editing.text}`),
                el("button", { class: "comment-action-btn", title: "Отменить", html: iconSvg("X", 14), onclick: () => ((editingCommentId = null), render()) }),
              ])
            : replyToComment
              ? el("div", { class: "comment-editing-bar" }, [
                  el("span", { html: iconSvg("MessageSquare", 13) }),
                  el("span", { class: "comment-editing-text" }, `Ответ ${replyToComment.author?.name ?? "пользователю"}`),
                  el("button", { class: "comment-action-btn", title: "Отменить", html: iconSvg("X", 14), onclick: () => ((replyToComment = null), render()) }),
                ])
              : null,
          el("div", { class: "story-comment-compose" }, [
            commentInput,
            el("button", {
              class: "story-send-btn",
              html: iconSvg("Send", 16),
              onclick: () => sendComment(commentInput.value, commentInput),
            }),
          ]),
        ])
      : null;

    const viewersPanel =
      mine && viewersOpen
        ? el("div", { class: "story-viewers-panel" }, [
            el("p", { class: "story-viewers-title" }, viewers === null ? "Загружаем…" : viewers.length ? "Смотрели" : "Пока никто не смотрел"),
            ...(viewers ?? []).map((u) =>
              el("button", { class: "story-viewer-row", title: "Открыть профиль", onclick: () => openAuthor(u) }, [
                Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 30 }),
                el("span", {}, u.name),
              ])
            ),
          ])
        : null;

    clear(overlay);
    overlay.append(
      el("div", { class: "story-shell" }, [
        el("div", { class: "story-progress-row" }, bars),
        el("div", { class: "story-header" }, [
          el("button", { class: "story-author-link", title: group.user.isChannel ? "Открыть канал" : "Открыть профиль", onclick: () => openAuthor(group.user) }, [
            Avatar({ name: group.user.name, color: group.user.avatarColor, image: group.user.avatarImage, size: 32 }),
          ]),
          el("div", { class: "story-header-titles" }, [
            el("p", { class: "story-header-name story-author-name-link", onclick: () => openAuthor(group.user) }, group.user.name),
            el("p", { class: "story-header-time" }, timeAgo(story.createdAt)),
          ]),
          frame.item.kind === "video"
            ? el("button", {
                class: "story-header-btn",
                title: muted ? "Включить звук" : "Выключить звук",
                html: iconSvg(muted ? "BellOff" : "Bell", 18),
                onclick: (e) => {
                  muted = !muted;
                  if (videoEl) {
                    const t = videoEl.currentTime;
                    const wasPlaying = !videoEl.paused && !videoEl.ended;
                    videoEl.muted = muted;
                    if (Math.abs((videoEl.currentTime || 0) - t) > 0.1) {
                      try {
                        videoEl.currentTime = t;
                      } catch {
                      }
                    }
                    if (wasPlaying) videoEl.play().catch(() => {});
                  }
                  const btn = e.currentTarget;
                  btn.title = muted ? "Включить звук" : "Выключить звук";
                  btn.innerHTML = iconSvg(muted ? "BellOff" : "Bell", 18);
                },
              })
            : null,
          mine || isServerModerator()
            ? el("button", {
                class: "story-header-btn",
                title: mine ? "Удалить" : "Удалить (модерация)",
                html: iconSvg("Trash", 18),
                onclick: async () => {
                  pause();
                  const count = story.items?.length ?? 1;
                  const question = !mine
                    ? `Удалить чужую историю «${group.user.name}» за нарушение правил? Автору придёт уведомление.`
                    : count > 1
                      ? `Удалить историю целиком — все ${count} кадра?`
                      : "Удалить историю?";
                  if (!(await askConfirm(question))) return closed ? undefined : resume();
                  try {
                    await api.deleteStory(story.id);
                  } catch (err) {
                    alert(err.message || "Не удалось удалить историю");
                    return resume();
                  }
                  dropStory(story.id);
                  onChanged?.();
                },
              })
            : null,
          el("button", { class: "story-header-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: close }),
        ]),
        media,
        el("div", { class: "story-tap-zones" }, [
          el("div", { class: "story-tap-zone", ...holdable(goPrevStory) }),
          el("div", { class: "story-tap-zone", ...holdable(goNextStory) }),
        ]),
        footer,
        viewersPanel,
        commentsPanel,
      ]),
      ...[
        gi > 0 ? el("button", { class: "story-nav prev", html: iconSvg("ChevronLeft", 22), onclick: goPrevGroup }) : null,
        gi < groups.length - 1 ? el("button", { class: "story-nav next", html: iconSvg("ChevronRight", 22), onclick: goNextGroup }) : null,
      ].filter(Boolean)
    );

    const paneOpen = commentsOpen || viewersOpen;
    if (frame.item.kind !== "video") {
      if (!paneOpen) startTimer(IMAGE_DURATION_MS);
    } else if (paneOpen) {
      videoEl?.pause();
    } else {
      setBarAnimation(0, false);
      if (!muted) videoEl?.play().catch(() => { muted = true; render(); });
    }
  }

  const HOLD_MS = 220;
  const SWIPE_MIN = 60;
  function holdable(onTap) {
    let held = false;
    let holdTimer = null;
    let downX = 0;
    let downY = 0;
    return {
      onpointerdown: (e) => {
        held = false;
        downX = e.clientX;
        downY = e.clientY;
        holdTimer = setTimeout(() => {
          held = true;
          pause();
        }, HOLD_MS);
      },
      onpointerup: (e) => {
        clearTimeout(holdTimer);
        if (held) return resume();
        const dx = e.clientX - downX;
        const dy = e.clientY - downY;
        if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.4) {
          return dx < 0 ? goNextGroup() : goPrevGroup();
        }
        onTap();
      },
      onpointerleave: () => {
        clearTimeout(holdTimer);
        if (held) resume();
      },
    };
  }

  render();
}
