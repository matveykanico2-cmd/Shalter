import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";
import { isServerModerator } from "../lib/moderation.js";
import { openProfileDialog } from "./profileDialog.js";

const IMAGE_DURATION_MS = 5000;

// Просмотр историй, устроенный так же, как к этому привыкли по Telegram:
// полоски-сегменты сверху (по одной на историю, текущая заполняется на глазах),
// нажатие слева и справа — назад и вперёд, удержание — пауза, внизу поле ответа
// автору, а у своей истории вместо поля — счётчик просмотров со списком тех,
// кто смотрел.
//
// Почему пауза по удержанию, а не кнопка: история идёт пять секунд и уходит
// сама. Единственный способ дочитать подпись или разглядеть картинку — задержать
// палец, и это движение здесь единственное, которое человек делает не глядя.
//
// groups: [{ user, stories: [{id, items: [{kind,url}], viewed, createdAt}] }].
//
// История может состоять из нескольких кадров: выбрали в галерее пять файлов —
// это одна история на пять кадров. Поэтому листается всё по кадрам, а полоска
// сверху рисует сегмент на каждый кадр; удаление же снимает историю целиком,
// со всеми её кадрами — по одному снимку из неё не вынуть.
export function openStoryViewer(groups, groupIndex, meId, onChanged, startIndex = 0) {
  let gi = groupIndex;
  // Открываемся ровно на том кадре, по которому нажали: из сетки в профиле
  // выбирают конкретный кадр, и начинать всегда с первого значило бы
  // «нажми на третий, посмотри первый».
  let si = Math.max(0, startIndex);
  let timer = null;
  let startedAt = 0;
  let remainingMs = IMAGE_DURATION_MS;
  let paused = false;
  let muted = true;
  let videoEl = null;
  // Кнопка лайка текущего кадра — чтобы обновлять её на месте, не пересобирая
  // весь просмотрщик (полный render пересоздаёт медиа и перезапускает историю).
  let likeBtnEl = null;
  let viewers = null; // список посмотревших свою историю, грузится по нажатию
  let viewersOpen = false;
  let comments = null; // комментарии текущей истории, грузятся по нажатию
  let commentsOpen = false;
  // Какой комментарий сейчас правится — поле ввода внизу панели переходит в
  // режим правки, как поле сообщения в чате.
  let editingCommentId = null;
  // Комментарий, на который сейчас отвечают (панель компоновки показывает «Ответ …»).
  let replyToComment = null;

  const overlay = el("div", { class: "story-viewer-overlay" });
  document.body.appendChild(overlay);

  // На телефоне экранная клавиатура перекрывает нижнюю панель: оверлей fixed, и
  // клавиатура его не сжимает, поэтому поле комментария/ответа оказывается за
  // ней. visualViewport — это видимая часть НАД клавиатурой; по её высоте
  // поднимаем панель и футер (через CSS-переменную --kb).
  const vv = window.visualViewport;
  function onViewport() {
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    overlay.style.setProperty("--kb", `${kb}px`);
  }
  vv?.addEventListener("resize", onViewport);
  vv?.addEventListener("scroll", onViewport);

  const currentGroup = () => groups[gi];

  // Плоский список кадров текущего автора: история на три снимка даёт три
  // кадра подряд — листаются они так же, как три отдельные истории раньше.
  function frames() {
    const group = currentGroup();
    if (!group) return [];
    return group.stories.flatMap((story) =>
      (story.items?.length ? story.items : [{ kind: story.kind, url: story.url }]).map((item, index) => ({ story, item, index }))
    );
  }
  const currentFrame = () => frames()[si];
  const currentStory = () => currentFrame()?.story;
  // У истории канала userId — id канала, не автора клика: «своя» она для
  // владельца/админа канала, а не для того, кто её выложил (сервер и решает,
  // кто это, через canManage — server/routes/stories.js).
  const isMine = () => currentStory()?.userId === meId || currentGroup()?.user?.id === meId || !!currentGroup()?.user?.canManage;

  function close() {
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

  // Нажатие на аватар/имя автора (в шапке, в комментариях, в списке
  // посмотревших) — закрываем историю и открываем профиль. История канала
  // ведёт в сам канал: профиля у канала нет, а смотрят его истории только
  // подписчики (server/routes/stories.js), так что /chat/:id им открыт.
  function openAuthor(author) {
    if (!author?.id) return;
    close();
    if (author.isChannel || String(author.id).startsWith("c_")) navigate(`/chat/${author.id}`);
    else openProfileDialog(author.id);
  }

  // Сколько прошло с публикации — «12 мин», «3 ч». Истории живут сутки, поэтому
  // дни здесь не нужны, а точное время не нужно тем более.
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

  // Таймер с паузой: считаем не «сколько прошло с начала», а сколько осталось,
  // иначе после каждой паузы история доигрывала бы с самого начала.
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

  // Заморозка для ввода: пока пишут комментарий/ответ, история НЕ должна
  // перелистываться (иначе поле пересоздаётся пустым — «текст не пишет»). В
  // отличие от pause(), не добавляет класс .paused, поэтому панель и поле ввода
  // остаются видимыми (при паузе UI прячется, чтобы смотреть фото).
  function freeze() {
    clearTimeout(timer);
    videoEl?.pause();
  }
  function unfreeze() {
    // Не размораживаем, пока открыта панель или стоит «настоящая» пауза.
    if (paused || commentsOpen || viewersOpen) return;
    if (videoEl) videoEl.play().catch(() => {});
    else startTimer(IMAGE_DURATION_MS);
  }

  // Полоска заполняется средствами CSS, а не перерисовкой по таймеру: анимация
  // идёт в браузере плавно и не зависит от того, чем занят наш код.
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
      // Перед запуском перехода нужен один кадр с нулевой шириной, иначе
      // браузер объединит оба изменения и полоска прыгнет в конец сразу.
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
    // Истёкшую историю (её открыли из архива в профиле) сервер отмечать не даёт
    // и правильно делает: «просмотрено» — это про ленту, а из ленты она давно
    // ушла. Не пытаемся, чтобы не ставить локальную отметку, которой на сервере
    // не будет.
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

  // Оптимистично меняем сердечко сразу, откатываем, если сервер отказал —
  // так же, как реакции на сообщения делают в остальном приложении.
  // Обновляет только кнопку лайка на месте — БЕЗ полного render(), который
  // пересоздал бы медиа и перезапустил историю с начала (это и был баг: лайк
  // перематывал историю).
  function refreshLikeButton() {
    const story = currentStory();
    if (!likeBtnEl || !story) return;
    likeBtnEl.className = `story-like-btn ${story.liked ? "liked" : ""}`;
    likeBtnEl.title = story.liked ? "Убрать лайк" : "Нравится";
    // Обновляем только внутренний span, не трогая частицы всплеска.
    let inner = likeBtnEl.querySelector(".story-like-inner");
    if (!inner) {
      inner = el("span", { class: "story-like-inner" });
      likeBtnEl.prepend(inner);
    }
    clear(inner);
    inner.append(el("span", { class: "story-like-heart" }, story.liked ? "❤️" : "🤍"));
    if (story.likeCount) inner.append(` ${story.likeCount}`);
  }

  // Красивый лайк: пульс сердца + разлетающиеся сердечки. Только при постановке
  // лайка (не при снятии).
  function burstLike() {
    if (!likeBtnEl) return;
    const heart = likeBtnEl.querySelector(".story-like-heart");
    if (heart) { heart.classList.remove("pop"); void heart.offsetWidth; heart.classList.add("pop"); }
    for (let i = 0; i < 6; i++) {
      const p = el("span", { class: "like-particle" }, "❤️");
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
      // Дедуп по id: WS-событие story:commented приходит и отправителю и могло
      // уже добавить этот же комментарий — без проверки он задваивался.
      if (comments && !comments.some((c) => c.id === comment.id)) comments = [...comments, comment];
      replyToComment = null;
      render();
    } catch (err) {
      input.value = clean;
      alert(err.message || "Не удалось отправить комментарий");
    }
  }

  // Лайк/снятие лайка комментария — оптимистично, с откатом при ошибке.
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

  // Удалить можно свой комментарий; под своей историей (или историей своего
  // канала) — любой; модератору сервера — любой (server/routes/stories.js).
  function canDeleteComment(c) {
    return c.userId === meId || isMine() || isServerModerator();
  }

  async function removeComment(c) {
    const story = currentStory();
    const question = c.userId === meId ? "Удалить комментарий?" : `Удалить комментарий ${c.author?.name ?? "пользователя"}?`;
    if (!confirm(question)) return;
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
      // Прикладываем ссылку на кадр истории и имя автора — в чате это покажется
      // как «Ответ на историю» с превью (server/routes/messages.js).
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

  // История исчезла — своя после удаления или чужая, которую автор убрал прямо
  // сейчас. Убираем все её кадры; кончились истории у автора — уходим к
  // следующему, кончились и они — закрываемся.
  function dropStory(storyId) {
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
    // Возвращаемся на тот же кадр, если он уцелел: удаление чужой истории не
    // должно перематывать то, что человек сейчас смотрит.
    const same = was ? list.findIndex((f) => f.story.id === was.story.id && f.index === was.index) : -1;
    si = same >= 0 ? same : Math.min(si, list.length - 1);
    render();
  }

  // Автор удалил историю у себя — у смотрящего она закрывается сама
  // (server/routes/stories.js рассылает это всем, кто её видит).
  const unsubDeleted = onWsMessage("story:deleted", ({ storyId }) => {
    if (!groups.some((g) => g.stories.some((st) => st.id === storyId))) return;
    dropStory(storyId);
    onChanged?.();
  });

  // Кто-то ещё лайкнул/прокомментировал ту же историю, пока мы её смотрим —
  // обновляем счётчик и (если панель комментариев открыта) список, не дожидаясь
  // повторного открытия просмотрщика.
  const unsubLiked = onWsMessage("story:liked", ({ storyId, likeCount }) => {
    for (const group of groups) {
      const story = group.stories.find((st) => st.id === storyId);
      if (story) story.likeCount = likeCount;
    }
    // Только счётчик — обновляем кнопку на месте, без перезапуска истории.
    if (currentStory()?.id === storyId) refreshLikeButton();
  });

  // Сейчас в фокусе поле ввода истории (комментарий/ответ)? Тогда чужое
  // WS-событие не должно перерисовывать всё — иначе поле пересоздастся пустым и
  // набранный текст пропадёт. Данные обновим, показ — при следующей перерисовке.
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

    // Ответ автору уходит обычным сообщением в личную переписку — так же, как
    // если бы человек написал сам. Отдельной ленты ответов на историю здесь
    // нет, и делать вид, что есть, незачем.
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

    // Свою историю не лайкают — кнопка нужна только у чужой, но счётчик под
    // ней видят оба: автору важно знать, сколько лайков собрала история.
    const likeBtn = !mine && !story.expired
      ? el(
          "button",
          {
            class: `story-like-btn ${story.liked ? "liked" : ""}`,
            title: story.liked ? "Убрать лайк" : "Нравится",
            onclick: toggleLike,
          },
          // Содержимое во внутреннем span — так всплеск сердечек (частицы)
          // можно добавлять прямо в кнопку, не стирая их при обновлении.
          [el("span", { class: "story-like-inner" }, [el("span", { class: "story-like-heart" }, story.liked ? "❤️" : "🤍"), story.likeCount ? ` ${story.likeCount}` : ""])]
        )
      : story.likeCount
        ? el("span", { class: "story-like-count" }, `❤️ ${story.likeCount}`)
        : null;
    // Ссылка на кнопку лайка (только интерактивная — у чужой непросроченной
    // истории), чтобы обновлять её на месте без перезапуска истории.
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
      : el("div", { class: "story-footer" }, [
          replyInput,
          el("button", { class: "story-send-btn", html: iconSvg("Send", 18), onclick: () => sendReply(replyInput.value, replyInput) }),
          likeBtn,
          commentsBtn,
        ]);

    // Одна строка комментария: аватар, автор, текст, лайк-сердце со счётчиком,
    // «Ответить», плюс изменить/удалить своего. isReply — вложенный ответ.
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
            // Ответ крепится к верхнему комментарию: у ответа отвечаем его родителю.
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

    // Раскладываем в потоки: верхние комментарии, под каждым — его ответы.
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
                onclick: () => {
                  muted = !muted;
                  if (videoEl) videoEl.muted = muted;
                  render();
                },
              })
            : null,
          // Модератор сервера удаляет и чужие истории (server/routes/stories.js).
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
                  if (!confirm(question)) return resume();
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
        // Зоны нажатия лежат поверх картинки: слева — назад, справа — вперёд,
        // удержание в любой из них ставит на паузу. Обычные кнопки не годятся —
        // нажатие должно срабатывать по отпусканию, иначе удержание сразу
        // пролистывало бы историю.
        el("div", { class: "story-tap-zones" }, [
          el("div", { class: "story-tap-zone", ...holdable(goPrevStory) }),
          el("div", { class: "story-tap-zone", ...holdable(goNextStory) }),
        ]),
        footer,
        viewersPanel,
        commentsPanel,
      ]),
      // Переход к соседнему автору — на широком экране стрелками по краям, как
      // в веб-версии Telegram. На телефоне их нет: там для этого зоны нажатия.
      ...[
        gi > 0 ? el("button", { class: "story-nav prev", html: iconSvg("ChevronLeft", 22), onclick: goPrevGroup }) : null,
        gi < groups.length - 1 ? el("button", { class: "story-nav next", html: iconSvg("ChevronRight", 22), onclick: goNextGroup }) : null,
        // .filter(Boolean) обязателен: Element.append() — не el(), пустоту он не
        // пропускает, а превращает null в текст «null». У первого автора стрелки
        // «назад» нет, и это слово печаталось прямо поверх кадра.
      ].filter(Boolean)
    );

    // Пока открыта панель комментариев/просмотревших — историю не листаем: там
    // пишут или читают, и авто-переход пересоздал бы поле ввода пустым.
    const paneOpen = commentsOpen || viewersOpen;
    if (frame.item.kind !== "video") {
      if (!paneOpen) startTimer(IMAGE_DURATION_MS);
    } else if (paneOpen) {
      videoEl?.pause();
    } else {
      setBarAnimation(0, false);
    }
  }

  // Нажатие с удержанием: короткое — переход, долгое — пауза, пока не отпустят.
  // Плюс горизонтальный свайп — листать истории ЛЮДЕЙ (влево — следующий,
  // вправо — предыдущий), как в Instagram; тап остаётся для кадров.
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
        // Горизонтальный свайп — между людьми; иначе обычный тап — по кадрам.
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
