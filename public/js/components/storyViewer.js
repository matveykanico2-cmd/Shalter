import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { onWsMessage } from "../lib/wsClient.js";

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
  let viewers = null; // список посмотревших свою историю, грузится по нажатию
  let viewersOpen = false;

  const overlay = el("div", { class: "story-viewer-overlay" });
  document.body.appendChild(overlay);

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
  const isMine = () => currentStory()?.userId === meId || currentGroup()?.user?.id === meId;

  function close() {
    clearTimeout(timer);
    videoEl?.pause();
    document.removeEventListener("keydown", onKey);
    unsubDeleted?.();
    overlay.remove();
  }

  // Сколько прошло с публикации — «12 мин», «3 ч». Истории живут сутки, поэтому
  // дни здесь не нужны, а точное время не нужно тем более.
  function timeAgo(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return "только что";
    if (min < 60) return `${min} мин`;
    return `${Math.floor(min / 60)} ч`;
  }

  function goNextStory() {
    if (si < frames().length - 1) {
      si++;
      render();
    } else goNextGroup();
  }

  function goPrevStory() {
    if (si > 0) {
      si--;
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
      render();
    } else close();
  }

  function goPrevGroup() {
    if (gi > 0) {
      gi--;
      si = 0;
      viewers = null;
      viewersOpen = false;
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

  async function sendReply(text, input) {
    const group = currentGroup();
    if (!text.trim()) return;
    input.value = "";
    try {
      const { chat } = await api.startDm(group.user.id, group.user.name, group.user.avatarColor);
      await api.sendMessage(chat.id, text.trim());
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
      onfocus: pause,
      onblur: resume,
      onkeydown: (e) => {
        if (e.key === "Enter") sendReply(e.target.value, e.target);
        e.stopPropagation();
      },
    });

    const footer = mine
      ? el("div", { class: "story-footer" }, [
          el(
            "button",
            {
              class: "story-viewers-btn",
              onclick: () => {
                viewersOpen = !viewersOpen;
                if (viewersOpen && viewers === null) loadViewers();
                else render();
              },
            },
            [el("span", { html: iconSvg("Users", 16) }), ` ${story.viewedByIds?.length ?? viewers?.length ?? 0} просмотров`]
          ),
        ])
      : el("div", { class: "story-footer" }, [
          replyInput,
          el("button", { class: "story-send-btn", html: iconSvg("Send", 18), onclick: () => sendReply(replyInput.value, replyInput) }),
        ]);

    const viewersPanel =
      mine && viewersOpen
        ? el("div", { class: "story-viewers-panel" }, [
            el("p", { class: "story-viewers-title" }, viewers === null ? "Загружаем…" : viewers.length ? "Смотрели" : "Пока никто не смотрел"),
            ...(viewers ?? []).map((u) =>
              el("button", { class: "story-viewer-row", onclick: () => { close(); navigate("/"); } }, [
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
          Avatar({ name: group.user.name, color: group.user.avatarColor, image: group.user.avatarImage, size: 32 }),
          el("div", { class: "story-header-titles" }, [
            el("p", { class: "story-header-name" }, group.user.name),
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
          mine
            ? el("button", {
                class: "story-header-btn",
                title: "Удалить",
                html: iconSvg("Trash", 18),
                onclick: async () => {
                  pause();
                  const count = story.items?.length ?? 1;
                  if (!confirm(count > 1 ? `Удалить историю целиком — все ${count} кадра?` : "Удалить историю?")) return resume();
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

    if (frame.item.kind !== "video") startTimer(IMAGE_DURATION_MS);
    else setBarAnimation(0, false);
  }

  // Нажатие с удержанием: короткое — переход, долгое — пауза, пока не отпустят.
  const HOLD_MS = 220;
  function holdable(onTap) {
    let held = false;
    let holdTimer = null;
    return {
      onpointerdown: () => {
        held = false;
        holdTimer = setTimeout(() => {
          held = true;
          pause();
        }, HOLD_MS);
      },
      onpointerup: () => {
        clearTimeout(holdTimer);
        if (held) resume();
        else onTap();
      },
      onpointerleave: () => {
        clearTimeout(holdTimer);
        if (held) resume();
      },
    };
  }

  render();
}
