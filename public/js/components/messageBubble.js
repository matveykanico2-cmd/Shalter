import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { translateLocally } from "../lib/localTranslate.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { formatText, previewText } from "../lib/formatText.js";
import { messagePreview } from "../lib/messagePreview.js";
import { api } from "../api.js";
import { openReportDialog } from "./reportDialog.js";
import { openProfileDialog } from "./profileDialog.js";
import { ImageAttachment, VideoAttachment, FileAttachment, LinkPreviewCard, LocationAttachment } from "./attachments.js";
import { getState, setState } from "../state.js";
import { renderSticker } from "../lib/stickers.js";
import { renderGiftArt } from "../lib/giftTraits.js";
import { giftBackgroundStyle } from "../lib/giftBackground.js";
import { renderCustomScene } from "../lib/customScene.js";
import { openStarsDialog } from "./starsDialog.js";
import { navigate } from "../router.js";
import { VerifiedBadge } from "./verifiedBadge.js";
import { PremiumStar } from "./premiumStar.js";
import { openGiftShopDialog } from "./giftShopDialog.js";
import { ALL_EMOJI } from "../lib/emojiList.js";
import { STICKERS, DRAWN_STICKERS } from "../lib/stickers.js";
import { openInAppBrowser, checkLinkSafety } from "./inAppBrowser.js";

const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const FLAG_RE = /^\p{Regional_Indicator}{2}$/u;
function isEmojiGrapheme(g) {
  return EXTENDED_PICTOGRAPHIC_RE.test(g) || FLAG_RE.test(g);
}
function jumboEmojiCount(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed || typeof Intl === "undefined" || !Intl.Segmenter) return 0;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].map((s) => s.segment);
  if (graphemes.length > 3) return 0;
  return graphemes.every(isEmojiGrapheme) ? graphemes.length : 0;
}

let currentAudibleMedia = null;
function playExclusiveMedia(mediaEl) {
  if (currentAudibleMedia && currentAudibleMedia !== mediaEl) {
    try {
      currentAudibleMedia.pause();
    } catch {
    }
  }
  currentAudibleMedia = mediaEl;
}

const translationCache = new Map();

const QUICK_EMOJI = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"];
const PREMIUM_QUICK_EMOJI = ["💎", "👑", "🚀", "🥂", "💯", "🌟"];

const REACTION_STICKERS = [...DRAWN_STICKERS, ...STICKERS];
const REACTION_STICKER_PREFIX = "sticker:";
function reactionSticker(emoji) {
  if (typeof emoji !== "string" || !emoji.startsWith(REACTION_STICKER_PREFIX)) return null;
  const id = emoji.slice(REACTION_STICKER_PREFIX.length);
  return REACTION_STICKERS.find((s) => s.id === id) ?? null;
}

function TapToLoad(kind, render) {
  const label = kind === "video" ? "Нажмите, чтобы посмотреть видео" : "Нажмите, чтобы посмотреть фото";
  let revealed = null;
  const placeholder = el("button", { class: "tap-to-load", type: "button" }, [
    el("span", { html: iconSvg(kind === "video" ? "Play" : "Download", 18) }),
    el("span", {}, label),
  ]);
  placeholder.addEventListener("click", () => {
    if (!revealed) revealed = render();
    placeholder.replaceWith(revealed);
  });
  return placeholder;
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const seenEntranceIds = new Set();

function entranceMessageMeta(message, mine, isChannel) {
  return el("div", { class: "entrance-message-meta" }, [
    el("span", { class: "mono" }, timeLabel(message.createdAt)),
    isChannel && typeof message.views === "number" ? el("span", { class: "mono" }, `${message.views} 👁`) : null,
    mine ? el("span", { html: iconSvg(message.readByIds?.length > 1 ? "CheckCheck" : "Check", 13) }) : null,
  ]);
}

async function convertGift(gift) {
  const me = getState().user;
  if (!confirm(`Обменять ${gift.emoji} «${gift.name}» на ${giftStars(gift)} ⭐? Подарок исчезнет с вашей полки.`)) return;
  try {
    const { user } = await api.getUser(me.id);
    const entry = (user.giftsReceived ?? [])
      .slice()
      .reverse()
      .find((g) => g.emoji === gift.emoji && (gift.serial == null || g.serial === gift.serial));
    if (!entry) {
      alert("Этот подарок уже не на полке");
      return;
    }
    const res = await api.convertGift(entry.id ?? `${entry.emoji}|${entry.at}`);
    alert(`Получено ${res.gained} ⭐. Баланс: ${res.balance} ⭐`);
  } catch (err) {
    alert(err.message || "Не удалось обменять подарок");
  }
}

const SPARKLE_ANGLES = [0, 60, 120, 180, 240, 300];
function GiftMessage(message, mine, isChannel) {
  const gift = message.gift;
  const isNew = !seenEntranceIds.has(message.id);
  seenEntranceIds.add(message.id);
  const isExclusive = !!gift.exclusive && gift.serial != null;
  return el("div", { class: `gift-message ${isExclusive ? "gift-message-exclusive" : ""} ${isNew ? "" : "no-entrance"}` }, [
    isExclusive ? el("p", { class: "gift-message-badge" }, `№${gift.serial} из ${gift.supply}`) : null,
    el("div", { class: `gift-message-burst ${gift.background ? "has-bg" : ""}`, style: gift.background ? { background: giftBackgroundStyle(gift.background) } : {} }, [
      el("div", { class: "gift-message-glow" }),
      ...SPARKLE_ANGLES.map((deg, i) =>
        el("span", { class: "gift-message-sparkle", style: `--angle: ${deg}deg; --delay: ${i * 0.05}s` }, "✨")
      ),
      el("div", { class: "gift-message-emoji" }, [renderGiftArt(gift, { size: 56, replay: isNew })]),
    ]),
    el("p", { class: "gift-message-name" }, gift.name),
    gift.fromName ? el("p", { class: "gift-message-from" }, `от ${gift.fromName}`) : null,
    isExclusive ? el("p", { class: "gift-message-exclusive-label" }, "Эксклюзивный подарок") : null,
    gift.durationLabel ? el("p", { class: "gift-message-duration" }, gift.durationLabel) : null,
    el("p", { class: "mono gift-message-price" }, gift.custom ? "Бесплатный подарок" : `⭐ ${formatRub(giftStars(gift))}`),
    !mine
      ? el("div", { class: "gift-message-actions" }, [
          el("button", { class: "gift-card-action", onclick: () => openProfileDialog(gift.recipientId ?? getState().user.id) }, "Показать в профиле"),
          gift.custom
            ? null
            : el("button", { class: "gift-card-action muted", onclick: () => convertGift(gift) }, `Обменять на ${formatRub(giftStars(gift))} ⭐`),
        ])
      : null,
    entranceMessageMeta(message, mine, isChannel),
  ]);
}

const STARS_PER_RUB = 10;
function giftStars(gift) {
  return gift.priceStars ?? Math.max(1, Math.round((gift.priceRub ?? 0) * STARS_PER_RUB));
}

function formatRub(n) {
  return Number(n).toLocaleString("ru-RU");
}

function StickerBody(message) {
  const sticker = message.sticker;
  const isNew = !seenEntranceIds.has(message.id);
  seenEntranceIds.add(message.id);
  return el("div", { class: `sticker-message ${sticker.kind === "image" ? "is-image" : ""} ${isNew ? "" : "no-entrance"}` }, [
    renderSticker(sticker, { size: sticker.kind === "image" ? 160 : 84, replay: isNew }),
  ]);
}

const REASON_LABELS = {
  spam: "Спам",
  scam: "Мошенничество",
  fake: "Поддельный аккаунт",
  violence: "Насилие или угрозы",
  terrorism: "Терроризм",
  extremism: "Экстремизм",
  drugs: "Продажа наркотиков",
  illegal: "Незаконный контент",
  child_safety: "Угроза безопасности детей",
  other: "Другое",
};
const REPORT_STATUS_LABELS = {
  resolved_deleted: "✅ Удалено",
  resolved_banned: "🚫 Пользователь заблокирован",
  dismissed: "Отклонено",
};

function ReportMessage(message, mine, me, isChannel) {
  const report = message.report;
  const isAdmin = !!me?.isDeveloper;
  let resolving = false;
  let status = report.status;

  const wrap = el("div", { class: "report-message" });

  async function resolve(action) {
    if (resolving) return;
    resolving = true;
    render();
    try {
      const res = await api.resolveReport(report.reportId, action, message.id);
      status = res.status;
    } catch (err) {
      alert(err.message || "Не удалось выполнить действие");
    } finally {
      resolving = false;
      render();
    }
  }

  function render() {
    clear(wrap);
    wrap.append(
      el("p", { class: "report-message-title" }, `🚩 Жалоба: ${REASON_LABELS[report.reason] ?? report.reason}`),
      el("p", { class: "report-message-summary" }, report.targetSummary),
      status === "open"
        ? isAdmin
          ? el("div", { class: "report-message-actions" }, [
              report.targetType !== "user"
                ? el("button", { class: "report-action-btn danger", disabled: resolving, onclick: () => resolve("delete") }, "Удалить")
                : null,
              report.canBan
                ? el("button", { class: "report-action-btn danger", disabled: resolving, onclick: () => resolve("ban") }, "Заблокировать")
                : null,
              el("button", { class: "report-action-btn", disabled: resolving, onclick: () => resolve("dismiss") }, "Отклонить"),
            ])
          : el("p", { class: "report-message-pending" }, "Ожидает решения администратора")
        : el("p", { class: "report-message-resolved" }, REPORT_STATUS_LABELS[status] ?? status),
      entranceMessageMeta(message, mine, isChannel)
    );
  }
  render();
  return wrap;
}

function BirthdayAttachment(a) {
  const { userId, name, avatarImage } = a.meta ?? {};
  return el("div", { class: "contact-attachment birthday-attachment" }, [
    Avatar({ name, image: avatarImage, size: 36 }),
    el("div", { class: "contact-attachment-body" }, [
      el("p", { class: "contact-attachment-name" }, [el("span", {}, "🎂 "), name || "Друг"]),
      el("p", { class: "settings-toggle-hint" }, "День рождения сегодня"),
    ]),
    userId
      ? el(
          "button",
          { class: "contact-attachment-add", onclick: () => openGiftShopDialog({ recipient: { id: userId, name } }) },
          "🎁 Подарить"
        )
      : null,
  ]);
}

function ContactAttachment(a, meId) {
  const { name, phone, userId } = a.meta ?? {};
  const wrap = el("div", { class: "contact-attachment" }, [
    el("span", { html: iconSvg("Users", 18) }),
    el("div", { class: "contact-attachment-body" }, [
      el("p", { class: "contact-attachment-name" }, name || "Контакт"),
      el("p", { class: "mono" }, phone || ""),
    ]),
  ]);

  if (!userId || userId === meId) return wrap;

  if (getState().contactIds?.includes(userId)) {
    wrap.appendChild(el("span", { class: "contact-attachment-done" }, "в контактах ✓"));
    return wrap;
  }

  const action = el("button", { class: "contact-attachment-add" }, "Добавить");
  action.addEventListener("click", async () => {
    action.disabled = true;
    try {
      await api.addContact(userId, name || null);
      setState({ contactIds: [...(getState().contactIds ?? []), userId] });
      action.replaceWith(el("span", { class: "contact-attachment-done" }, "в контактах ✓"));
    } catch (err) {
      action.disabled = false;
      alert(err.message || "Не удалось добавить контакт");
    }
  });
  wrap.appendChild(action);
  return wrap;
}

function PollAttachment(message, a, me, onVote, onPollAction) {
  const options = a.meta?.options ?? [];
  const votes = a.meta?.votes ?? options.map(() => 0);
  const voterIds = a.meta?.voterIds ?? options.map(() => []);
  const voters = new Set(voterIds.flat());
  const totalVoters = voters.size;
  const denom = totalVoters || 1;
  const myVotes = voterIds.map((ids, i) => (ids.includes(me.id) ? i : -1)).filter((i) => i >= 0);
  const myVoteIdx = myVotes[0] ?? -1;
  const correctIndex = Number.isInteger(a.meta?.correctIndex) ? a.meta.correctIndex : null;
  const isQuiz = correctIndex !== null;
  const multiple = !!a.meta?.multiple && !isQuiz;
  const closed = !!a.meta?.closed;
  const answered = myVotes.length > 0;
  const showResults = answered || closed;
  const gotIt = isQuiz && answered && myVoteIdx === correctIndex;
  const maxVotes = Math.max(0, ...votes);
  const canClose = !closed && (message.senderId === me.id || a.canClose);

  const kindLabel = closed ? "Опрос завершён" : isQuiz ? "Викторина" : multiple ? "Несколько ответов" : "Опрос";

  return el("div", { class: `poll-attachment ${isQuiz ? "quiz" : ""} ${closed ? "closed" : ""}` }, [
    el("p", { class: "poll-question" }, message.text),
    el("p", { class: "poll-kind" }, kindLabel),
    el(
      "div",
      { class: "poll-options" },
      options.map((opt, i) => {
        const pct = Math.round((votes[i] / denom) * 100);
        const mark = !isQuiz || !answered ? "" : i === correctIndex ? "correct" : i === myVoteIdx ? "wrong" : "";
        const mine = myVotes.includes(i);
        const leader = showResults && votes[i] > 0 && votes[i] === maxVotes;
        return el(
          "button",
          {
            class: `poll-option ${mine ? "my-vote" : ""} ${mark} ${showResults ? "has-results" : ""} ${leader ? "leader" : ""}`,
            disabled: closed || (isQuiz && answered) || (!multiple && answered),
            onclick: () => onVote(message, i),
          },
          [
            showResults ? el("span", { class: "poll-option-fill", style: { width: `${pct}%` } }) : null,
            showResults
              ? el("span", { class: "mono poll-option-pct" }, `${pct}%`)
              : el("span", { class: `poll-option-radio ${multiple ? "square" : ""}` }),
            el("span", { class: "poll-option-label" }, [
              opt,
              mine && !isQuiz ? el("span", { class: "poll-mark mine" }, "✓") : null,
              mark === "correct" ? el("span", { class: "poll-mark" }, "✓") : null,
              mark === "wrong" ? el("span", { class: "poll-mark" }, "✗") : null,
            ]),
          ]
        );
      })
    ),
    isQuiz && answered
      ? el("p", { class: `poll-quiz-result ${gotIt ? "ok" : "bad"}` }, gotIt ? "Верно!" : `Неверно. Правильный ответ: ${options[correctIndex]}`)
      : null,
    el("div", { class: "poll-footer" }, [
      el("span", { class: "poll-total" }, totalVoters ? `${totalVoters} ${votersWord(totalVoters)}` : "Пока нет голосов"),
      answered && !isQuiz && !closed && onPollAction
        ? el("button", { class: "poll-action", onclick: () => onPollAction(message, "retract") }, "Отменить голос")
        : null,
      canClose && onPollAction
        ? el(
            "button",
            {
              class: "poll-action danger",
              onclick: () => {
                if (confirm("Остановить опрос? Голосовать больше будет нельзя, итоги сохранятся.")) onPollAction(message, "close");
              },
            },
            "Остановить"
          )
        : null,
    ]),
  ]);
}

// Чек-лист: пункты с отметками «кто выполнил». members — чтобы показать имя.
function ChecklistAttachment(message, a, me, members, onRefresh) {
  const items = a.meta?.items ?? [];
  const author = message.senderId === me.id;
  const canMark = author || a.meta?.othersCanMark !== false;
  const canAdd = (author || a.meta?.othersCanAdd) && items.length < 30;
  const done = items.filter((it) => it.doneBy).length;
  const nameOf = (id) => (id === me.id ? "вы" : members?.find((u) => u.id === id)?.name ?? "участник");

  async function run(body) {
    try {
      await api.updateChecklist(message.chatId, message.id, body);
      if (body.add) onRefresh?.();
    } catch (err) {
      onRefresh?.();
      alert(err.message || "Не удалось изменить чек-лист");
    }
  }

  return el("div", { class: "checklist-attachment" }, [
    el("p", { class: "poll-question" }, message.text || "Чек-лист"),
    el("p", { class: "poll-kind" }, `Выполнено ${done} из ${items.length}`),
    el(
      "div",
      { class: "checklist-items" },
      items.map((it) =>
        el(
          "button",
          {
            class: `checklist-item${it.doneBy ? " done" : ""}`,
            disabled: !canMark || message.pending,
            title: it.doneBy ? `Отметил(а): ${nameOf(it.doneBy)}` : "",
            onclick: (e) => {
              // Отметка сразу, запрос — в фоне; при ошибке run() перерисует с сервера.
              const btn = e.currentTarget;
              const nowDone = !btn.classList.contains("done");
              btn.classList.toggle("done", nowDone);
              if (nowDone) Object.assign(it, { doneBy: me.id, doneAt: new Date().toISOString() });
              else {
                delete it.doneBy;
                delete it.doneAt;
              }
              btn.querySelector(".checklist-box").textContent = nowDone ? "✓" : "";
              btn.querySelector(".checklist-by")?.remove();
              const box = btn.closest(".checklist-attachment");
              const kind = box?.querySelector(".poll-kind");
              if (kind) kind.textContent = `Выполнено ${box.querySelectorAll(".checklist-item.done").length} из ${items.length}`;
              run({ itemId: it.id });
            },
          },
          [
            el("span", { class: "checklist-box" }, it.doneBy ? "✓" : ""),
            el("span", { class: "checklist-text" }, it.text),
            it.doneBy && it.doneBy !== message.senderId ? el("span", { class: "checklist-by" }, nameOf(it.doneBy)) : null,
          ]
        )
      )
    ),
    canAdd && !message.pending
      ? el(
          "button",
          {
            class: "poll-action",
            onclick: () => {
              const text = prompt("Новый пункт");
              if (text?.trim()) run({ add: [text.trim()] });
            },
          },
          "+ Добавить пункт"
        )
      : null,
  ]);
}

function votersWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "проголосовал";
  return "проголосовали";
}

function attachSeek(bar, media, durationOf) {
  const seekTo = (event) => {
    const rect = bar.getBoundingClientRect();
    if (!rect.width) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const dur = durationOf();
    if (Number.isFinite(dur) && dur > 0) media.currentTime = fraction * dur;
  };
  bar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    bar.setPointerCapture(event.pointerId);
    bar.classList.add("seeking");
    seekTo(event);
  });
  bar.addEventListener("pointermove", (event) => {
    if (bar.hasPointerCapture?.(event.pointerId)) seekTo(event);
  });
  const release = (event) => {
    bar.classList.remove("seeking");
    if (bar.hasPointerCapture?.(event.pointerId)) bar.releasePointerCapture(event.pointerId);
  };
  bar.addEventListener("pointerup", release);
  bar.addEventListener("pointercancel", release);
}

function clockTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function VoicePlayer(a) {
  const audio = el("audio", { src: a.url, class: "hidden-audio", preload: "metadata" });
  const playBtn = el("button", { class: "voice-play-btn", html: iconSvg("Play", 14) });
  const barFill = el("div", { class: "voice-bar-fill" });
  const timeLabelEl = el("p", { class: "voice-time mono" }, `0:00 / ${clockTime(a.durationSec ?? 0)}`);
  const speedBtn = el("button", { class: "voice-speed-btn" }, "1×");
  let playing = false;
  let speed = 1;

  playBtn.addEventListener("click", () => {
    if (playing) audio.pause();
    else audio.play();
  });
  audio.addEventListener("play", () => {
    playing = true;
    playExclusiveMedia(audio);
    playBtn.innerHTML = "";
    playBtn.appendChild(el("span", { class: "voice-pause-icon" }));
  });
  audio.addEventListener("pause", () => {
    playing = false;
    playBtn.innerHTML = iconSvg("Play", 14);
  });
  audio.addEventListener("ended", () => {
    playing = false;
    playBtn.innerHTML = iconSvg("Play", 14);
  });
  const bar = el("div", { class: "voice-bar seekable" }, [barFill, el("span", { class: "voice-bar-knob" })]);

  const durationOf = () => {
    if (a.durationSec && a.durationSec > 0) return a.durationSec;
    const known = audio.duration;
    return Number.isFinite(known) && known > 0 ? known : 0;
  };
  const paint = () => {
    const dur = durationOf() || 1;
    const done = Math.min(100, (audio.currentTime / dur) * 100);
    barFill.style.width = `${done}%`;
    bar.style.setProperty("--voice-knob-left", `${done}%`);
    timeLabelEl.textContent = `${clockTime(audio.currentTime)} / ${clockTime(dur)}`;
  };
  audio.addEventListener("timeupdate", paint);
  audio.addEventListener("seeking", paint);
  audio.addEventListener("loadedmetadata", paint);
  speedBtn.addEventListener("click", () => {
    speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    audio.playbackRate = speed;
    speedBtn.textContent = `${speed}×`;
  });

  attachSeek(bar, audio, durationOf);

  return el("div", { class: "voice-block" }, [
    el("div", { class: "voice-player" }, [
      audio,
      playBtn,
      el("div", { class: "voice-progress" }, [bar, timeLabelEl]),
      speedBtn,
    ]),
  ]);
}

function VideoNotePlayer(a) {
  const video = el("video", { src: a.url, class: "video-note-el", playsinline: true, preload: "metadata" });
  const overlay = el("span", { class: "video-note-overlay", html: iconSvg("Play", 28) });

  const RADIUS = 48;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 100 100");
  ring.setAttribute("class", "video-note-ring");
  ring.innerHTML =
    `<circle cx="50" cy="50" r="${RADIUS}" class="video-note-ring-track"/>` +
    `<circle cx="50" cy="50" r="${RADIUS}" class="video-note-ring-fill" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}"/>`;
  const ringFill = ring.querySelector(".video-note-ring-fill");

  const barFill = el("div", { class: "voice-bar-fill" });
  const bar = el("div", { class: "voice-bar seekable" }, [barFill, el("span", { class: "voice-bar-knob" })]);
  const timeLabelEl = el("p", { class: "voice-time mono" }, `0:00 / ${clockTime(a.durationSec ?? 0)}`);
  const durationOf = () => {
    if (a.durationSec && a.durationSec > 0) return a.durationSec;
    const known = video.duration;
    return Number.isFinite(known) && known > 0 ? known : 0;
  };
  attachSeek(bar, video, durationOf);

  const circle = el("button", { class: "video-note-player" }, [video, ring, overlay]);
  let playing = false;
  circle.addEventListener("click", () => {
    if (playing) video.pause();
    else video.play();
  });
  video.addEventListener("play", () => {
    playing = true;
    playExclusiveMedia(video);
    overlay.style.display = "none";
  });
  video.addEventListener("pause", () => {
    playing = false;
    overlay.style.display = "flex";
  });
  video.addEventListener("ended", () => {
    playing = false;
    overlay.style.display = "flex";
  });
  const paint = () => {
    const dur = durationOf() || 1;
    const ct = Math.max(0, Math.min(video.currentTime || 0, dur));
    const done = Math.min(1, ct / dur);
    ringFill.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - done)));
    barFill.style.width = `${done * 100}%`;
    bar.style.setProperty("--voice-knob-left", `${done * 100}%`);
    timeLabelEl.textContent = `${clockTime(ct)} / ${clockTime(dur)}`;
  };
  video.addEventListener("timeupdate", paint);
  video.addEventListener("seeking", paint);
  video.addEventListener("loadedmetadata", paint);

  return el("div", { class: "video-note-wrap" }, [
    circle,
    el("div", { class: "video-note-seek" }, [bar, timeLabelEl]),
  ]);
}

const typedOut = new Set();

function typeOutOnce(node, messageId) {
  if (typedOut.has(messageId)) return;
  typedOut.add(messageId);
  const full = node.textContent ?? "";
  if (!full || full.length > 400) return;

  requestAnimationFrame(() => {
    if (!node.isConnected) return;
    const real = [...node.childNodes];
    const ghost = document.createElement("span");
    ghost.className = "message-text-typing";
    node.textContent = "";
    node.appendChild(ghost);

    let i = 0;
    const step = Math.max(1, Math.round(full.length / 40));
    const timer = setInterval(() => {
      if (!node.isConnected) return clearInterval(timer);
      i = Math.min(full.length, i + step);
      ghost.textContent = full.slice(0, i);
      if (i >= full.length) {
        clearInterval(timer);
        node.textContent = "";
        real.forEach((child) => node.appendChild(child));
      }
    }, 25);
  });
}

export function AttachmentView(a, me) {
  const autoDownload = getState().settings?.autoDownload !== false;
  if (a.kind === "voice") return VoicePlayer(a);
  if (a.kind === "video-note") return VideoNotePlayer(a);
  if (a.kind === "image") return autoDownload ? ImageAttachment(a) : TapToLoad("image", () => ImageAttachment(a));
  if (a.kind === "video") return autoDownload ? VideoAttachment(a) : TapToLoad("video", () => VideoAttachment(a));
  if (a.kind === "file") return FileAttachment(a);
  if (a.kind === "location") return LocationAttachment(a);
  if (a.kind === "contact") return ContactAttachment(a, me.id);
  if (a.kind === "birthday") return BirthdayAttachment(a);
  return null;
}

export function MessageBubble({ message, me, sender, showSender, groupStart = true, groupEnd = true, isChannel = false, isDm = false, canPin = true, selection = null, replyToMessage, replyToSender = null, members, handlers, allowedReactions = null, canViewReactionDetails = true, protectedContent = false, senderTag = null }) {
  const { onReply, onEdit, onDelete, onReact, onPin, onJumpTo, onForward, onVote, onPollAction, onKeyboardAction, onKeyboardApp, onOpenThread } = handlers;
  const mine = message.senderId === me.id;

  if (message.type === "system") {
    return el("div", { class: "system-message" }, message.text);
  }

  if (message.type === "gift" && message.gift) {
    return GiftMessage(message, mine, isChannel);
  }

  if (message.type === "report" && message.report) {
    return ReportMessage(message, mine, me, isChannel);
  }

  const isSticker = message.type === "sticker" && !!message.sticker;
  const isCallLog = isCallLogMessage(message);
  const isVideoNote =
    !message.text?.trim() && message.attachments?.length === 1 && message.attachments[0]?.kind === "video-note";
  const bubbleInner = [];

  if (message.forwardedFrom) {
    const fromEl = message.forwardedFrom.linkAllowed
      ? el(
          "button",
          { class: "forwarded-banner-name-btn", onclick: () => openProfileDialog(message.forwardedFrom.senderId) },
          message.forwardedFrom.senderName
        )
      : message.forwardedFrom.senderName;
    bubbleInner.push(
      el("p", { class: "forwarded-banner" }, [el("span", { html: iconSvg("Forward", 12) }), " Переслано от ", fromEl])
    );
  }
  if (replyToMessage) {
    bubbleInner.push(
      replyToMessage.deleted
        ? el("div", { class: "reply-preview reply-preview-deleted" }, "Удалённое сообщение")
        : el("button", { class: "reply-preview", onclick: () => onJumpTo(replyToMessage.id) }, [
            replyToSender?.name ? el("span", { class: "reply-preview-name" }, replyToSender.name) : null,
            el("span", { class: "reply-preview-text" }, previewText(messagePreview(replyToMessage)) || "Сообщение"),
          ])
    );
  }
  if (message.storyReply) {
    const sr = message.storyReply;
    bubbleInner.push(
      el("div", { class: "story-reply-banner" }, [
        sr.url
          ? sr.kind === "video"
            ? el("video", { class: "story-reply-thumb", src: sr.url, muted: true, playsinline: true, preload: "metadata" })
            : el("img", { class: "story-reply-thumb", src: sr.url, alt: "", loading: "lazy" })
          : null,
        el("div", { class: "story-reply-text" }, [
          el("span", { class: "story-reply-label" }, "Ответ на историю"),
          sr.authorName ? el("span", { class: "story-reply-author" }, sr.authorName) : null,
        ]),
      ])
    );
  }
  const atts = message.attachments ?? [];
  const mediaAtts = atts.filter((a) => a.kind === "image" || a.kind === "video");
  const album = mediaAtts.length >= 2;
  let albumPlaced = false;
  for (const a of atts) {
    if (a.kind === "poll") {
      bubbleInner.push(PollAttachment(message, { ...a, canClose: handlers.canClosePolls }, me, onVote, onPollAction));
    } else if (a.kind === "checklist") {
      bubbleInner.push(ChecklistAttachment(message, a, me, members, handlers.onRefresh));
    } else if (album && (a.kind === "image" || a.kind === "video")) {
      if (albumPlaced) continue;
      albumPlaced = true;
      const n = Math.min(mediaAtts.length, 4);
      bubbleInner.push(
        el(
          "div",
          { class: `message-album album-${n}${mediaAtts.length > 4 ? " album-many" : ""}` },
          mediaAtts.map((m) => el("div", { class: "message-album-cell" }, [AttachmentView(m, me)]))
        )
      );
    } else {
      bubbleInner.push(AttachmentView(a, me));
    }
  }
  if (isSticker) {
    bubbleInner.push(StickerBody(message));
  } else if (!message.attachments?.some((a) => a.kind === "poll" || a.kind === "checklist")) {
    const jumboCount = !message.attachments?.length ? jumboEmojiCount(message.text) : 0;
    const ceOnly =
      !message.attachments?.length && message.customEmoji && /^\s*(\[ce:\d+\]\s*)+$/.test(message.text || "")
        ? [...message.text.matchAll(/\[ce:(\d+)\]/g)].map((m) => Number(m[1]))
        : null;
    const textNode =
      ceOnly && ceOnly.length <= 3
        ? el(
            "span",
            { class: "message-text message-custom-jumbo" },
            ceOnly.map((idx) =>
              message.customEmoji[idx]
                ? el("span", { class: "inline-custom-emoji jumbo" }, [renderCustomScene(message.customEmoji[idx], { size: 100, replay: true })])
                : document.createTextNode("🎨")
            )
          )
        : jumboCount
          ? el("span", { class: `message-text message-text-jumbo jumbo-${jumboCount}` }, message.text)
          : el("span", { class: "message-text" }, formatText(message.text, members, message.customEmoji));
    if (message.paidStars) typeOutOnce(textNode, message.id);
    bubbleInner.push(textNode);
  }
  if (message.linkPreview) {
    bubbleInner.push(LinkPreviewCard(message.linkPreview));
  }

  const meta = el("span", { class: `message-meta ${isSticker ? "message-meta-sticker" : ""}` }, [
    message.editedAt ? el("span", {}, "изменено") : null,
    el("span", { class: "mono" }, timeLabel(message.createdAt)),
    isChannel && typeof message.views === "number" ? el("span", { class: "mono" }, `${message.views} 👁`) : null,
    mine
      ? el("span", {
          class: message.pending ? "msg-status-pending" : "",
          html: iconSvg(message.pending ? "Clock" : message.readByIds.length > 1 ? "CheckCheck" : "Check", 13),
        })
      : null,
  ]);
  bubbleInner.push(meta);

  const boosted = !!message.boostedUntil && message.boostedUntil > new Date().toISOString();
  const bubble = el(
    "div",
    { class: `bubble ${mine ? "mine" : ""} ${isSticker ? "bubble-sticker" : ""} ${isVideoNote ? "bubble-videonote" : ""} ${boosted ? "bubble-boosted" : ""}` },
    bubbleInner
  );

  const canTranslate = !isSticker && !!message.text?.trim() && !message.attachments?.some((a) => a.kind === "poll");
  let translationEl = null;
  async function toggleTranslation() {
    if (translationEl) {
      translationEl.remove();
      translationEl = null;
      return;
    }
    const lang = getState().settings?.translateLanguage || "ru";
    const cacheKey = `${lang}\n${message.text}`;
    const cached = translationCache.get(cacheKey);
    if (cached) {
      translationEl = el("p", { class: "message-translation" }, cached);
      bubble.insertBefore(translationEl, meta);
      return;
    }
    translationEl = el("p", { class: "message-translation" }, "Переводим…");
    bubble.insertBefore(translationEl, meta);
    try {
      // Server (Google) first: Chrome's on-device translator often misdetects short or
      // mixed-language messages and hands back the original text or a garbled one.
      let text = await api
        .translateText(message.text, lang)
        .then((r) => (r.detectedLang && r.detectedLang === lang ? "Сообщение уже на этом языке" : r.translated))
        .catch(() => null);
      if (!text) text = await translateLocally(message.text, lang).catch(() => null);
      if (!text) throw new Error("no translation");
      translationCache.set(cacheKey, text);
      if (translationEl) translationEl.textContent = text;
    } catch {
      if (translationEl) translationEl.textContent = "Не удалось перевести";
    }
  }

  const hoverActions = el("div", { class: "bubble-actions" }, [
        el("button", {
          class: "bubble-action-btn",
          title: "Реакция",
          html: iconSvg("Smile", 15),
          onclick: (e) => {
            e.stopPropagation();
            togglePicker({ x: e.clientX, y: e.clientY });
          },
        }),
        el("button", {
          class: "bubble-action-btn",
          title: "Ответить",
          html: iconSvg("Reply", 15),
          onpointerdown: rememberQuote,
          onclick: () => replyWithQuote(),
        }),
        el("button", {
          class: "bubble-action-btn",
          title: "Ещё",
          html: iconSvg("More", 15),
          onclick: (e) => openMessageMenu({ x: e.clientX, y: e.clientY }),
        }),
      ]);

  let picker = null;
  let closePicker = null;
  const restricted = Array.isArray(allowedReactions);
  function togglePicker(pos) {
    if (picker) {
      closePicker();
      return;
    }
    picker = el(
      "div",
      { class: "emoji-picker" },
      restricted
        ? [
            el(
              "div",
              { class: "emoji-picker-row" },
              allowedReactions.map((e) =>
                el("button", { onclick: () => { onReact(message, e); closePicker(); } }, e)
              )
            ),
          ]
        : [
            el(
              "div",
              { class: "emoji-picker-row" },
              QUICK_EMOJI.map((e) =>
                el(
                  "button",
                  {
                    onclick: () => {
                      onReact(message, e);
                      closePicker();
                    },
                  },
                  e
                )
              )
            ),
            el(
              "div",
              { class: "emoji-picker-row emoji-picker-row-premium" },
              PREMIUM_QUICK_EMOJI.map((e) =>
                el(
                  "button",
                  {
                    class: me?.isPremium ? "" : "locked",
                    title: me?.isPremium ? "" : "Реакция для Premium",
                    onclick: () => {
                      closePicker();
                      if (me?.isPremium) onReact(message, e);
                      else navigate("/settings/premium");
                    },
                  },
                  [e, !me?.isPremium ? el("span", { class: "emoji-picker-lock", html: iconSvg("Lock", 9) }) : null]
                )
              )
            ),
            el(
              "div",
              { class: "emoji-picker-all" },
              ALL_EMOJI.map((e) =>
                el("button", { onclick: () => { onReact(message, e); closePicker(); } }, e)
              )
            ),
            el(
              "div",
              { class: "emoji-picker-all emoji-picker-stickers" },
              REACTION_STICKERS.map((s) =>
                el(
                  "button",
                  { title: s.name, onclick: () => { onReact(message, REACTION_STICKER_PREFIX + s.id); closePicker(); } },
                  [renderSticker(s, { size: 26 })]
                )
              )
            ),
          ]
    );
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    picker.style.left = `${Math.min(pos.x, vw - 260)}px`;
    picker.style.top = `${Math.min(Math.max(pos.y - 50, 8), vh - 50)}px`;
    document.body.appendChild(picker);
    const pickerRect = picker.getBoundingClientRect();
    if (pickerRect.bottom > vh - 8) {
      picker.style.top = `${Math.max(8, vh - pickerRect.height - 8)}px`;
    }

    closePicker = () => {
      document.removeEventListener("mousedown", onOutsideClick);
      picker.remove();
      picker = null;
      closePicker = null;
    };
    function onOutsideClick(e) {
      if (!picker.contains(e.target)) closePicker();
    }
    setTimeout(() => document.addEventListener("mousedown", onOutsideClick), 0);
  }

  let pendingQuote = "";
  function rememberQuote() {
    const sel = window.getSelection?.();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    pendingQuote = text && bubble.contains(sel.anchorNode) && bubble.contains(sel.focusNode) ? text.slice(0, 500) : "";
  }
  function replyWithQuote() {
    const quote = pendingQuote;
    pendingQuote = "";
    onReply(message, quote ? { quote } : undefined);
  }

  const readers = !isDm && !isChannel && mine ? (message.readByIds ?? []).filter((id) => id !== me.id) : [];
  function showReaders(pos) {
    const known = readers.map((id) => members?.find((u) => u.id === id)).filter(Boolean);
    openDropdownMenu(pos, [
      { label: `Прочитали: ${readers.length}` },
      ...known.map((u) => ({ icon: "User", label: u.name, onClick: () => openProfileDialog(u.id) })),
    ]);
  }

  function showReactionDetails(r, pos) {
    const known = r.userIds.map((id) => members?.find((u) => u.id === id)).filter(Boolean);
    const sticker = reactionSticker(r.emoji);
    const label = sticker ? `${sticker.emoji} ${sticker.name}` : r.emoji;
    openDropdownMenu(pos, [
      { label: `${label} — ${r.userIds.length}` },
      ...known.map((u) => ({ icon: "User", label: u.name, onClick: () => openProfileDialog(u.id) })),
    ]);
  }
  function reactionPillHandlers(r) {
    if (!canViewReactionDetails) return { onclick: () => onReact(message, r.emoji) };
    const HOLD_MS = 450;
    const SLOP = 10;
    let timer = null;
    let startX = 0;
    let startY = 0;
    let justHeld = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return {
      oncontextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        showReactionDetails(r, { x: e.clientX, y: e.clientY });
      },
      onpointerdown: (e) => {
        startX = e.clientX;
        startY = e.clientY;
        timer = setTimeout(() => {
          timer = null;
          justHeld = true;
          showReactionDetails(r, { x: startX, y: startY });
          navigator.vibrate?.(12);
        }, HOLD_MS);
      },
      onpointermove: (e) => {
        if (timer && (Math.abs(e.clientX - startX) > SLOP || Math.abs(e.clientY - startY) > SLOP)) cancel();
      },
      onpointerup: cancel,
      onpointercancel: cancel,
      onpointerleave: cancel,
      onclick: () => {
        if (justHeld) {
          justHeld = false;
          return;
        }
        onReact(message, r.emoji);
      },
    };
  }

  function openMessageMenu(pos) {
    const items = [
      { icon: "Reply", label: "Ответить", onClick: replyWithQuote },
      { icon: "Smile", label: "Реакция", onClick: () => togglePicker(pos) },
      ...(canPin ? [{ icon: "Pin", label: message.pinned ? "Открепить" : "Закрепить", onClick: () => onPin(message) }] : []),
      ...(protectedContent ? [] : [{ icon: "Forward", label: "Переслать", onClick: () => onForward(message) }]),
      ...(message.text?.trim() && !protectedContent
        ? [{
            icon: "Copy",
            label: "Копировать текст",
            onClick: () => navigator.clipboard?.writeText(message.text).catch(() => {}),
          }]
        : []),
      ...(selection ? [{ icon: "Check", label: "Выбрать", onClick: () => selection.onToggle(message.id) }] : []),
      ...(readers.length ? [{ icon: "CheckCheck", label: `Прочитали: ${readers.length}`, onClick: () => showReaders(pos) }] : []),
    ];
    if (onOpenThread && !message.threadRootId) {
      items.push({ icon: "MessageSquare", label: "Ответить в теме", onClick: () => onOpenThread(message) });
    }
    if (canTranslate) {
      items.push({ icon: "Globe", label: translationEl ? "Скрыть перевод" : "Перевести", onClick: toggleTranslation });
    }
    if (mine) {
      items.push({ icon: "Star", label: "Поднять за звёзды", onClick: () => boostForStars(message) });
    } else if (isDm) {
      items.push({ icon: "Trash", label: "Удалить за звёзды", danger: true, onClick: () => deleteForStars(message) });
    }
    if (mine && !isSticker && !isCallLog) items.push({ icon: "Edit", label: "Изменить", onClick: () => onEdit(message) });
    else if (!mine) {
      items.push({
        icon: "Info",
        label: "Пожаловаться",
        danger: true,
        onClick: () => openReportDialog("message", message.id, sender?.name ? `сообщение от ${sender.name}` : "сообщение"),
      });
    }
    items.push({ icon: "Trash", label: "Удалить", danger: true, onClick: () => onDelete(message) });
    openDropdownMenu(pos, items);
  }

  async function runPaid(fn, fallbackMessage) {
    try {
      await fn();
    } catch (err) {
      if (/не хватает/i.test(err.message ?? "")) {
        if (confirm(`${err.message}. Открыть покупку звёзд?`)) openStarsDialog();
        return;
      }
      alert(err.message || fallbackMessage);
    }
  }

  function boostForStars(msg) {
    runPaid(async () => {
      await api.boostMessage(msg.id);
      handlers.onRefresh?.();
    }, "Не удалось поднять сообщение");
  }

  function deleteForStars(msg) {
    runPaid(async () => {
      await api.paidDeleteMessage(msg.id);
      handlers.onRefresh?.();
    }, "Не удалось удалить сообщение");
  }

  const bubbleWrap = el("div", {
    class: `bubble-wrap ${isSticker ? "bubble-wrap-sticker" : ""}`,
    oncontextmenu: (e) => {
      e.preventDefault();
      rememberQuote();
      if (selection?.active) {
        selection.onToggle(message.id);
        return;
      }
      openMessageMenu({ x: e.clientX, y: e.clientY });
    },
  }, [bubble, hoverActions]);
  if (selection?.active) {
    bubbleWrap.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        selection.onToggle(message.id);
      },
      true
    );
  }

  if (selection) {
    const HOLD_MS = 450;
    const SLOP = 10;
    let timer = null;
    let startX = 0;
    let startY = 0;

    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    bubbleWrap.addEventListener("pointerdown", (e) => {
      if (e.button && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        selection.onToggle(message.id);
        bubbleWrap.addEventListener("click", (ev) => ev.stopPropagation(), { capture: true, once: true });
        navigator.vibrate?.(12);
      }, HOLD_MS);
    });
    bubbleWrap.addEventListener("pointermove", (e) => {
      if (timer && (Math.abs(e.clientX - startX) > SLOP || Math.abs(e.clientY - startY) > SLOP)) cancel();
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) bubbleWrap.addEventListener(ev, cancel);
  }

  if (message.signedBy) {
    bubble.appendChild(el("p", { class: "message-signature" }, message.signedBy));
  }

  const reactionsRow = message.reactions.length
    ? el(
        "div",
        { class: "reactions-row" },
        message.reactions.map((r) => {
          const sticker = reactionSticker(r.emoji);
          const SHOWN = 3;
          const avatars = r.userIds
            .slice(0, SHOWN)
            .map((id) => (id === me.id ? me : members?.find((u) => u.id === id)))
            .filter(Boolean);
          return el(
            "button",
            {
              class: `reaction-pill ${sticker ? "reaction-pill-sticker" : ""} ${r.userIds.includes(me.id) ? "mine" : ""}`,
              "data-emoji": r.emoji,
              "data-msgid": message.id,
              ...reactionPillHandlers(r),
            },
            [
              el("span", { class: "reaction-pill-glyph" }, [
                sticker ? renderSticker(sticker, { size: 22 }) : r.emoji,
              ]),
              avatars.length
                ? el(
                    "span",
                    { class: "reaction-pill-avatars" },
                    avatars.map((u) =>
                      el("span", { class: "reaction-pill-avatar", title: u.name }, [
                        Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 16 }),
                      ])
                    )
                  )
                : null,
              el("span", { class: "reaction-pill-count mono" }, String(r.userIds.length)),
            ].filter(Boolean)
          );
        })
      )
    : null;

  const keyboardRows = message.keyboard
    ? el(
        "div",
        { class: "keyboard-rows" },
        message.keyboard.map((row) =>
          el(
            "div",
            { class: "keyboard-row" },
            row.map((btn) => {
              const tone = btn.style ? ` keyboard-btn-${btn.style}` : "";
              if (btn.app) return el("button", { class: `keyboard-btn keyboard-btn-app${tone}`, onclick: () => onKeyboardApp?.(message, btn.app) }, btn.text);
              if (btn.url)
                return el(
                  "button",
                  {
                    class: `keyboard-btn keyboard-btn-url${tone}`,
                    title: btn.url,
                    onclick: () => {
                      const { unsafe, warning } = checkLinkSafety(btn.url);
                      openInAppBrowser(btn.url, { unsafe, warning });
                    },
                  },
                  btn.text
                );
              return el("button", { class: `keyboard-btn${tone}`, onclick: () => onKeyboardAction(btn.action ?? btn.data) }, btn.text);
            })
          )
        )
      )
    : null;

  const column = el("div", { class: `message-column ${mine ? "mine" : ""}` }, [
    showSender && !mine && sender
      ? el(
          "button",
          { class: "sender-name", onclick: () => openProfileDialog(sender.id) },
          [el("span", { class: "sender-name-text" }, sender.name), VerifiedBadge(sender, 12), sender.isPremium ? PremiumStar({ size: 13, seed: sender.id, title: "Shalter Premium" }) : null, senderTag ? el("span", { class: "sender-tag" }, senderTag) : null].filter(Boolean)
        )
      : null,
    bubbleWrap,
    reactionsRow,
    keyboardRows,
  ]);

  const isSelected = !!selection?.ids?.has(message.id);

  const SWIPE_START_PX = 12;
  const SWIPE_REPLY_PX = 48;
  const DOUBLE_TAP_MS = 300;
  let swipeX = 0;
  let swipeY = 0;
  let swiping = null;
  let lastTapAt = 0;

  const gestures = {
    onpointerdown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      swipeX = e.clientX;
      swipeY = e.clientY;
      swiping = null;
    },
    onpointermove: (e) => {
      if (swipeX === 0 || swiping === false) return;
      const dx = e.clientX - swipeX;
      const dy = Math.abs(e.clientY - swipeY);
      if (swiping === null) {
        if (Math.abs(dx) < SWIPE_START_PX && dy < SWIPE_START_PX) return;
        swiping = Math.abs(dx) > dy && dx > 0;
        if (!swiping) return;
      }
      const shift = Math.min(72, Math.max(0, dx));
      row.style.transform = `translateX(${shift}px)`;
      row.classList.toggle("swipe-ready", shift >= SWIPE_REPLY_PX);
    },
    onpointerup: (e) => {
      const dx = e.clientX - swipeX;
      swipeX = 0;
      row.style.transform = "";
      const wasSwipe = swiping === true;
      row.classList.remove("swipe-ready");
      swiping = null;
      if (wasSwipe) {
        if (dx >= SWIPE_REPLY_PX) replyWithQuote();
        return;
      }
      if (selection?.active || e.target.closest?.("button, a, input, video, audio, .bubble-actions")) {
        lastTapAt = 0;
        return;
      }
      const now = Date.now();
      if (now - lastTapAt < DOUBLE_TAP_MS) {
        lastTapAt = 0;
        onReact?.(message, "❤️");
      } else lastTapAt = now;
    },
    onpointercancel: () => {
      swipeX = 0;
      swiping = null;
      row.style.transform = "";
      row.classList.remove("swipe-ready");
    },
  };

  const row = el(
    "div",
    {
      class: `message-row ${mine ? "mine" : ""} ${groupStart ? "group-start" : ""} ${groupEnd ? "group-end" : ""} ${selection?.active ? "selecting" : ""} ${isSelected ? "selected" : ""}`,
      id: `msg-${message.id}`,
      ...gestures,
    },
    [
      selection?.active
        ? el("button", {
            class: `message-select-mark ${isSelected ? "on" : ""}`,
            title: isSelected ? "Убрать из выбранных" : "Выбрать",
            html: isSelected ? iconSvg("Check", 13) : "",
            onclick: (e) => {
              e.stopPropagation();
              selection.onToggle(message.id);
            },
          })
        : null,
      !mine
        ? el(
            "div",
            { class: "message-avatar-slot" },
            groupEnd && sender
              ? el(
                  "button",
                  { class: "message-avatar-btn", title: `Профиль: ${sender.name}`, onclick: () => openProfileDialog(sender.id) },
                  [Avatar({ name: sender.name, color: sender.avatarColor, image: sender.avatarImage, size: 30 })]
                )
              : null
          )
        : null,
      column,
    ]
  );

  return row;
}

// Call-log lines ("📞 Пропущенный звонок" and co.) are written by the server
// on the caller's behalf — they're a record, not something the caller typed,
// so they can't be edited. Older ones predate type "call" and are plain text
// (matched by wording, but only before the cut-over so typed text isn't caught).
const CALL_LOG_RE = /^📞 (Звонок|Видеозвонок|Пропущенный звонок|Звонок отклонён)/;
export function isCallLogMessage(m) {
  if (m?.type === "call") return true;
  return m?.type === "text" && (m.createdAt ?? "") < "2026-10-03" && !m.attachments?.length && CALL_LOG_RE.test(m.text ?? "");
}
