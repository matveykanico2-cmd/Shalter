import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { formatText } from "../lib/formatText.js";
import { api } from "../api.js";
import { openReportDialog } from "./reportDialog.js";
import { openProfileDialog } from "./profileDialog.js";
import { ImageAttachment, VideoAttachment, FileAttachment, LinkPreviewCard, LocationAttachment } from "./attachments.js";
import { transcribeAudio, transcriptCache } from "../lib/transcribe.js";
import { getState } from "../state.js";
import { renderScene } from "../lib/animScenes.js";
import { openStarsDialog } from "./starsDialog.js";

const QUICK_EMOJI = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"];

// Settings → Данные и память → «Автозагрузка медиа», turned off. There's no
// separate download step to actually defer in this app (an attachment's
// data: URL already arrived as part of the message payload — see AGENTS.md),
// so "off" means deferring the *render* instead: a tap-to-reveal placeholder
// rather than decoding/painting a potentially large image or video the
// moment the message list scrolls it into view.
function TapToLoad(kind, render) {
  const label = kind === "video" ? "Нажмите, чтобы посмотреть видео" : "Нажмите, чтобы посмотреть фото";
  let revealed = null;
  const placeholder = el("button", { class: "tap-to-load", type: "button" }, [
    el("span", { html: iconSvg(kind === "video" ? "Video" : "Download", 18) }),
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

// Delivered gift (server/routes/gifts.js's /deliver, message type "gift") —
// a big animated card instead of a plain bubble, same "special, centered,
// not a normal chat bubble" treatment as .system-message. The sparkle burst
// is a one-shot entrance (CSS animation, no infinite loop) so it reads as
// "a gift just arrived" without permanently distracting from the rest of
// the chat every time this message scrolls into view.
// chatView.js's renderList() does a full clear()+rebuild on every 15s poll
// and every WS message event *anywhere in the chat* (see its refreshMessages
// setInterval) — with no vdom, that recreates every bubble's DOM node from
// scratch each time. Without this, a gift/sticker's one-shot entrance
// animation (the sparkle burst, the pop-in) would replay right along with
// it, so a message sent minutes ago keeps re-flashing every time anyone else
// in the chat sends something. Tracked here (not per-render state) so it
// survives exactly as long as the tab does, same pattern as
// lib/transcribe.js's transcriptCache.
const seenEntranceIds = new Set();

// Same time/views/read-check row a plain text bubble gets (see the `meta`
// build below in MessageBubble), for the message types that render as a
// standalone card rather than a bubble: gifts, report cards and payment cards.
// Those skipped it entirely before, so they looked unlike every other message
// in the log — no send time, no way to tell if the other side had seen it.
// (Stickers used to be in this group; they're normal bubbles now and use the
// regular .message-meta.)
function entranceMessageMeta(message, mine, isChannel) {
  return el("div", { class: "entrance-message-meta" }, [
    el("span", { class: "mono" }, timeLabel(message.createdAt)),
    isChannel && typeof message.views === "number" ? el("span", { class: "mono" }, `${message.views} 👁`) : null,
    mine ? el("span", { html: iconSvg(message.readByIds?.length > 1 ? "CheckCheck" : "Check", 13) }) : null,
  ]);
}

// Trading a received gift for stars. The shelf entry is found by matching what
// the card knows (emoji + arrival time) against the shelf, because the card
// itself carries no shelf-entry id — the message predates the shelf row.
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
  // Limited gifts (server/data/gifts.js's `supply` tier) carry the serial
  // they were minted with — the whole point of that tier, so it gets a
  // gold-framed card and the "№3 из 10" badge rather than looking like any
  // other gift.
  const isExclusive = !!gift.exclusive && gift.serial != null;
  return el("div", { class: `gift-message ${isExclusive ? "gift-message-exclusive" : ""} ${isNew ? "" : "no-entrance"}` }, [
    isExclusive ? el("p", { class: "gift-message-badge" }, `№${gift.serial} из ${gift.supply}`) : null,
    el("div", { class: "gift-message-burst" }, [
      el("div", { class: "gift-message-glow" }),
      ...SPARKLE_ANGLES.map((deg, i) =>
        el("span", { class: "gift-message-sparkle", style: `--angle: ${deg}deg; --delay: ${i * 0.05}s` }, "✨")
      ),
      // The gift itself now performs a scene too, same system the stickers use.
      el("div", { class: "gift-message-emoji" }, [renderScene(gift.emoji, { size: 56, replay: isNew })]),
    ]),
    el("p", { class: "gift-message-name" }, gift.name),
    // Who it's from. A gift with no sender shown is just an object that
    // appeared; the point is that a particular person sent it.
    gift.fromName ? el("p", { class: "gift-message-from" }, `от ${gift.fromName}`) : null,
    isExclusive ? el("p", { class: "gift-message-exclusive-label" }, "Эксклюзивный подарок") : null,
    gift.durationLabel ? el("p", { class: "gift-message-duration" }, gift.durationLabel) : null,
    el("p", { class: "mono gift-message-price" }, `⭐ ${formatRub(giftStars(gift))}`),
    // Only on the card of a gift *you* received: keep it on the profile, or trade
    // it back for stars (routes/gifts.js's /convert).
    !mine
      ? el("div", { class: "gift-message-actions" }, [
          el("button", { class: "gift-card-action", onclick: () => openProfileDialog(getState().user.id) }, "Показать в профиле"),
          el("button", { class: "gift-card-action muted", onclick: () => convertGift(gift) }, `Обменять на ${formatRub(giftStars(gift))} ⭐`),
        ])
      : null,
    entranceMessageMeta(message, mine, isChannel),
  ]);
}

// Gifts sent before star pricing existed only carry priceRub. Deriving the star
// figure here at the same 10⭐/₽ rate the catalogue uses (see data/gifts.js)
// keeps the chat log from showing some gifts in rubles and others in stars.
const STARS_PER_RUB = 10;
function giftStars(gift) {
  return gift.priceStars ?? Math.max(1, Math.round((gift.priceRub ?? 0) * STARS_PER_RUB));
}

// 1000000 -> "1 000 000". Only ever applied to gift prices, which now span
// 1₽ to a million — an unseparated "1000000₽" is genuinely hard to read at
// a glance, and misreading a price by a factor of ten matters here.
function formatRub(n) {
  return Number(n).toLocaleString("ru-RU");
}

// A sent sticker (public/js/lib/stickers.js) — a big emoji playing its own
// named animation (see .sticker-<anim> in components.css). This used to be a
// standalone, centered block like .system-message/.gift-message, which meant
// a sticker was the one message type you couldn't tell apart by sender (it
// sat in the middle of the log regardless of who sent it) and couldn't reply
// to, react to, forward or delete. It's a real message, so it now goes
// through the normal bubble pipeline below (row → column → bubble-wrap) and
// only drops the bubble's background/padding, keeping the left/right
// alignment, avatar, sender name, hover actions and context menu every other
// message has.
function StickerBody(message) {
  const sticker = message.sticker;
  const isNew = !seenEntranceIds.has(message.id);
  seenEntranceIds.add(message.id);
  // A multi-part scene rather than one wobbling emoji — see lib/animScenes.js.
  // `sticker.scene` lets a sticker pack name the performance explicitly;
  // without one the emoji picks its own.
  return el("div", { class: `sticker-message ${isNew ? "" : "no-entrance"}` }, [
    renderScene(sticker.emoji, { size: 84, preferred: sticker.scene, replay: isNew }),
  ]);
}

// Same set as reportDialog.js / server/routes/reports.js.
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

// A new-report notification (server/routes/reports.js) — lands in the
// admin's chat with the Shalter service bot same as login codes/security
// alerts. Only the admin (me.isDeveloper — see data/sanitize.js's publicUser,
// "whoever currently holds ADMIN_PHONE") sees the action buttons; everyone
// else (there normally isn't anyone else in this chat) just sees the plain
// summary. Buttons disappear once report.status moves off "open" — either
// because *this* viewer just resolved it (local optimistic update) or a
// poll/WS refresh picked up someone else having done so.
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

function ContactAttachment(a) {
  const { name, phone } = a.meta ?? {};
  return el("div", { class: "contact-attachment" }, [
    el("span", { html: iconSvg("Users", 18) }),
    el("div", {}, [el("p", { class: "contact-attachment-name" }, name || "Контакт"), el("p", { class: "mono" }, phone || "")]),
  ]);
}

function PollAttachment(message, a, me, onVote) {
  const options = a.meta?.options ?? [];
  const votes = a.meta?.votes ?? options.map(() => 0);
  const voterIds = a.meta?.voterIds ?? options.map(() => []);
  const totalVotes = votes.reduce((s, v) => s + v, 0);
  const denom = totalVotes || 1;
  const myVoteIdx = voterIds.findIndex((ids) => ids.includes(me.id));

  return el("div", { class: "poll-attachment" }, [
    el("p", { class: "poll-question" }, `📊 ${message.text}`),
    el(
      "div",
      { class: "poll-options" },
      options.map((opt, i) => {
        const pct = Math.round((votes[i] / denom) * 100);
        return el(
          "button",
          { class: `poll-option ${myVoteIdx === i ? "my-vote" : ""}`, onclick: () => onVote(message, i) },
          [
            myVoteIdx >= 0 ? el("span", { class: "poll-option-fill", style: { width: `${pct}%` } }) : null,
            el("span", { class: "poll-option-label" }, [
              opt,
              myVoteIdx >= 0 ? el("span", { class: "mono poll-option-pct" }, `${pct}%`) : null,
            ]),
          ]
        );
      })
    ),
    el("p", { class: "mono poll-total" }, `${totalVotes} ${votesWord(totalVotes)}`),
  ]);
}

function votesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "голос";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "голоса";
  return "голосов";
}

function VoicePlayer(a) {
  const audio = el("audio", { src: a.url, class: "hidden-audio" });
  const playBtn = el("button", { class: "voice-play-btn", html: iconSvg("Play", 14) });
  const barFill = el("div", { class: "voice-bar-fill" });
  const timeLabelEl = el("p", { class: "voice-time mono" }, `0s / ${Math.round(a.durationSec ?? 0)}s`);
  const speedBtn = el("button", { class: "voice-speed-btn" }, "1×");
  let playing = false;
  let speed = 1;

  playBtn.addEventListener("click", () => {
    if (playing) audio.pause();
    else audio.play();
  });
  audio.addEventListener("play", () => {
    playing = true;
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
  audio.addEventListener("timeupdate", () => {
    const dur = audio.duration || a.durationSec || 1;
    barFill.style.width = `${Math.min(100, (audio.currentTime / dur) * 100)}%`;
    timeLabelEl.textContent = `${Math.floor(audio.currentTime)}s / ${Math.round(dur)}s`;
  });
  speedBtn.addEventListener("click", () => {
    speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    audio.playbackRate = speed;
    speedBtn.textContent = `${speed}×`;
  });

  return el("div", { class: "voice-player" }, [
    audio,
    playBtn,
    el("div", { class: "voice-progress" }, [el("div", { class: "voice-bar" }, [barFill]), timeLabelEl]),
    speedBtn,
  ]);
}

function VideoNotePlayer(a) {
  const video = el("video", { src: a.url, class: "video-note-el", playsinline: true });
  const overlay = el("span", { class: "video-note-overlay", html: iconSvg("Play", 28) });
  const wrap = el("button", { class: "video-note-player" }, [video, overlay]);
  let playing = false;
  wrap.addEventListener("click", () => {
    if (playing) video.pause();
    else video.play();
  });
  video.addEventListener("play", () => {
    playing = true;
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
  return wrap;
}

export function MessageBubble({ message, me, sender, showSender, groupStart = true, groupEnd = true, isChannel = false, isDm = false, canPin = true, selection = null, replyToMessage, members, handlers }) {
  const { onReply, onEdit, onDelete, onReact, onPin, onJumpTo, onForward, onVote, onKeyboardAction, onOpenThread } = handlers;
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
  const bubbleInner = [];

  if (message.forwardedFrom) {
    // linkAllowed (stamped server-side at forward time — see routes/
    // messages.js) reflects the original sender's "who can see a link to me
    // in forwards" privacy setting — when it's false, the name still shows
    // (Telegram doesn't hide *that* either) but isn't clickable to a profile.
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
      el(
        "button",
        { class: "reply-preview", onclick: () => onJumpTo(replyToMessage.id) },
        replyToMessage.text || "Медиа"
      )
    );
  }
  const autoDownload = getState().settings?.autoDownload !== false;
  if (message.attachments?.length) {
    for (const a of message.attachments) {
      if (a.kind === "poll") bubbleInner.push(PollAttachment(message, a, me, onVote));
      else if (a.kind === "voice") bubbleInner.push(VoicePlayer(a));
      else if (a.kind === "video-note") bubbleInner.push(VideoNotePlayer(a));
      else if (a.kind === "image") bubbleInner.push(autoDownload ? ImageAttachment(a) : TapToLoad("image", () => ImageAttachment(a)));
      else if (a.kind === "video") bubbleInner.push(autoDownload ? VideoAttachment(a) : TapToLoad("video", () => VideoAttachment(a)));
      else if (a.kind === "file") bubbleInner.push(FileAttachment(a));
      else if (a.kind === "location") bubbleInner.push(LocationAttachment(a));
      else if (a.kind === "contact") bubbleInner.push(ContactAttachment(a));
    }
  }
  if (isSticker) {
    bubbleInner.push(StickerBody(message));
  } else if (!message.attachments?.some((a) => a.kind === "poll")) {
    bubbleInner.push(el("span", { class: "message-text" }, formatText(message.text, members)));
  }
  if (message.linkPreview) {
    bubbleInner.push(LinkPreviewCard(message.linkPreview));
  }

  const meta = el("span", { class: `message-meta ${isSticker ? "message-meta-sticker" : ""}` }, [
    message.editedAt ? el("span", {}, "изменено") : null,
    el("span", { class: "mono" }, timeLabel(message.createdAt)),
    // Only channels get a view counter — Telegram shows one there and nowhere
    // else, and "0 👁" under every private message is pure noise.
    isChannel && typeof message.views === "number" ? el("span", { class: "mono" }, `${message.views} 👁`) : null,
    mine
      ? el("span", { html: iconSvg(message.readByIds.length > 1 ? "CheckCheck" : "Check", 13) })
      : null,
  ]);
  bubbleInner.push(meta);

  // Boosted with stars: highlighted until boostedUntil passes.
  const boosted = !!message.boostedUntil && message.boostedUntil > new Date().toISOString();
  const bubble = el(
    "div",
    { class: `bubble ${mine ? "mine" : ""} ${isSticker ? "bubble-sticker" : ""} ${boosted ? "bubble-boosted" : ""}` },
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
    translationEl = el("p", { class: "message-translation" }, "Переводим…");
    bubble.insertBefore(translationEl, meta);
    try {
      const { settings } = await api.getSettings();
      const { translated } = await api.translateText(message.text, settings.translateLanguage || "ru");
      translationEl.textContent = translated || "—";
    } catch {
      translationEl.textContent = "Не удалось перевести";
    }
  }

  // Runs entirely in this tab (see lib/transcribe.js) — the first ever call
  // on a given page load downloads the model, so that state's worth showing
  // rather than leaving "Расшифровываем…" sitting there with no explanation
  // for several seconds.
  const voiceAttachment = message.attachments?.find((a) => a.kind === "voice" || a.kind === "video-note");
  let transcriptEl = null;

  function showTranscript(promise) {
    transcriptEl = el("p", { class: "message-translation" }, "Расшифровываем…");
    bubble.insertBefore(transcriptEl, meta);
    promise.then(
      (text) => {
        if (transcriptEl) transcriptEl.textContent = text || "(тишина или не удалось разобрать речь)";
      },
      (err) => {
        if (transcriptEl) transcriptEl.textContent = err.message || "Не удалось расшифровать";
      }
    );
  }

  // Restores an already-running (or already-finished) transcription this
  // exact message started under a *previous* bubble instance — see
  // transcriptCache's own comment for why that can happen well before this
  // one ever finishes.
  if (voiceAttachment && transcriptCache.has(message.id)) {
    showTranscript(transcriptCache.get(message.id));
  }

  function toggleTranscription() {
    if (transcriptEl) {
      transcriptEl.remove();
      transcriptEl = null;
      transcriptCache.delete(message.id);
      return;
    }
    const promise = transcribeAudio(voiceAttachment.url, (p) => {
      if (p.status === "progress" && transcriptEl) {
        transcriptEl.textContent = `Загружаем модель распознавания… ${Math.round(p.progress || 0)}%`;
      }
    });
    transcriptCache.set(message.id, promise);
    showTranscript(promise);
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
          onclick: () => onReply(message),
        }),
        el("button", {
          class: "bubble-action-btn",
          title: "Ещё",
          html: iconSvg("More", 15),
          onclick: (e) => openMessageMenu({ x: e.clientX, y: e.clientY }),
        }),
      ]);

  // position:fixed + JS-computed, viewport-clamped coordinates, appended to
  // <body> — same pattern as openDropdownMenu (public/js/components/
  // dropdownMenu.js), and for the same reason: this used to be position:
  // absolute relative to the bubble, which put it inside .message-list's
  // scrolling/clipping box. For the first message in a chat there's no room
  // above it, so the picker's negative offset escaped the scroll container's
  // top edge and got clipped there — invisible, and clicks fell through to
  // the chat header painted underneath.
  let picker = null;
  let closePicker = null;
  function togglePicker(pos) {
    if (picker) {
      closePicker();
      return;
    }
    picker = el(
      "div",
      { class: "emoji-picker" },
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
    );
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    picker.style.left = `${Math.min(pos.x, vw - 260)}px`;
    picker.style.top = `${Math.min(Math.max(pos.y - 50, 8), vh - 50)}px`;
    document.body.appendChild(picker);

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

  function openMessageMenu(pos) {
    // Reply/react are included here too (not just Pin/Forward/Edit/Delete)
    // since this menu is also the touch entry point (long-press, below) —
    // the .bubble-actions hover bar those normally live in never shows on a
    // touchscreen, so without this they'd be unreachable on mobile.
    const items = [
      { icon: "Reply", label: "Ответить", onClick: () => onReply(message) },
      { icon: "Smile", label: "Реакция", onClick: () => togglePicker(pos) },
      // Hidden rather than shown-and-refused: in a group or channel only the
      // people running it may pin (server/routes/messages.js's canPin), and an
      // item that always answers 403 is worse than no item.
      ...(canPin ? [{ icon: "Pin", label: message.pinned ? "Открепить" : "Закрепить", onClick: () => onPin(message) }] : []),
      { icon: "Forward", label: "Переслать", onClick: () => onForward(message) },
      // Copying the text was only possible by selecting it with the mouse, which
      // on a phone means fighting the long-press menu.
      ...(message.text?.trim()
        ? [{
            icon: "Copy",
            label: "Копировать текст",
            onClick: () => navigator.clipboard?.writeText(message.text).catch(() => {}),
          }]
        : []),
      ...(selection ? [{ icon: "Check", label: "Выбрать", onClick: () => selection.onToggle(message.id) }] : []),
    ];
    // Group-chat threads (threadPanel.js) — a nested sub-conversation kept
    // out of the main timeline, unlike a plain "Ответить" quote-reply above.
    // Not offered on a message that's already itself a thread reply (see
    // db.js's threadRootId comment: threads are one level deep, not nested).
    if (onOpenThread && !message.threadRootId) {
      items.push({ icon: "MessageSquare", label: "Ответить в теме", onClick: () => onOpenThread(message) });
    }
    if (canTranslate) {
      items.push({ icon: "Globe", label: translationEl ? "Скрыть перевод" : "Перевести", onClick: toggleTranslation });
    }
    if (voiceAttachment) {
      items.push({ icon: "Mic", label: transcriptEl ? "Скрыть расшифровку" : "Расшифровать", onClick: toggleTranscription });
    }
    // Paid actions (server/routes/stars.js). Boost applies to your own message;
    // paid deletion to someone else's, and only in a DM — see that route for why
    // it isn't offered in groups.
    if (mine) {
      items.push({ icon: "Star", label: "Поднять за звёзды", onClick: () => boostForStars(message) });
    } else if (isDm) {
      items.push({ icon: "Trash", label: "Удалить за звёзды", danger: true, onClick: () => deleteForStars(message) });
    }
    // No "Изменить" for a sticker — it carries no text to edit (the composer
    // would open with an empty draft and rewrite the sticker into a text
    // message on save).
    if (mine && !isSticker) items.push({ icon: "Edit", label: "Изменить", onClick: () => onEdit(message) });
    else {
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

  // A failed paid action is almost always "not enough stars" — offering the
  // top-up right there beats an alert the user can only acknowledge.
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
      // In selection mode the right-click/long-press gesture toggles the
      // message instead of opening a menu — the menu's actions all apply to one
      // message, which is the opposite of what selecting several is for.
      if (selection?.active) {
        selection.onToggle(message.id);
        return;
      }
      openMessageMenu({ x: e.clientX, y: e.clientY });
    },
    onclick: selection?.active ? () => selection.onToggle(message.id) : null,
  }, [bubble, hoverActions]);

  // Hold a message to start selecting — the gesture Telegram uses, and the only
  // one that exists on a touchscreen, where there is no right-click and the
  // hover toolbar never appears. Replaces the "Выбрать сообщения" item that used
  // to live in the chat's own menu, two taps away from the messages it acts on.
  if (selection) {
    const HOLD_MS = 450;
    // Enough movement to be a scroll rather than a hold. Without this, dragging
    // the list on a phone would arm selection every time.
    const SLOP = 10;
    let timer = null;
    let startX = 0;
    let startY = 0;

    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    bubbleWrap.addEventListener("pointerdown", (e) => {
      // Left button / touch only: the right button already opens the menu.
      if (e.button && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        selection.onToggle(message.id);
        // A hold that has become a selection must not also fire the click that
        // follows it, or the message would be selected and instantly unselected.
        bubbleWrap.addEventListener("click", (ev) => ev.stopPropagation(), { capture: true, once: true });
        navigator.vibrate?.(12);
      }, HOLD_MS);
    });
    bubbleWrap.addEventListener("pointermove", (e) => {
      if (timer && (Math.abs(e.clientX - startX) > SLOP || Math.abs(e.clientY - startY) > SLOP)) cancel();
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) bubbleWrap.addEventListener(ev, cancel);
  }

  const reactionsRow = message.reactions.length
    ? el(
        "div",
        { class: "reactions-row" },
        message.reactions.map((r) =>
          el(
            "button",
            {
              class: `reaction-pill ${r.userIds.includes(me.id) ? "mine" : ""}`,
              onclick: () => onReact(message, r.emoji),
            },
            [r.emoji, el("span", { class: "mono" }, String(r.userIds.length))]
          )
        )
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
            row.map((btn) =>
              // Real inline-keyboard behavior (matches Telegram, and what
              // BOTS.md documents to bot authors): tapping sends the action
              // immediately as a normal message — it doesn't just quote it
              // into the composer for the user to send themselves.
              el("button", { class: "keyboard-btn", onclick: () => onKeyboardAction(btn.action) }, btn.text)
            )
          )
        )
      )
    : null;

  const column = el("div", { class: `message-column ${mine ? "mine" : ""}` }, [
    // The sender's name opens their profile, same as tapping their avatar
    // below — in a group these two are the only things identifying who wrote a
    // message, and neither did anything when tapped.
    showSender && !mine && sender
      ? el("button", { class: "sender-name", onclick: () => openProfileDialog(sender.id) }, sender.name)
      : null,
    bubbleWrap,
    reactionsRow,
    keyboardRows,
  ]);

  // The avatar goes beside the *last* message of a run, not the first — that's
  // where Telegram puts it, and it keeps the whole block visually anchored to
  // the bottom where the newest message is.
  const isSelected = !!selection?.ids?.has(message.id);
  return el(
    "div",
    {
      class: `message-row ${mine ? "mine" : ""} ${groupStart ? "group-start" : ""} ${groupEnd ? "group-end" : ""} ${selection?.active ? "selecting" : ""} ${isSelected ? "selected" : ""}`,
      id: `msg-${message.id}`,
    },
    [
      selection?.active
        ? el("span", { class: `message-select-mark ${isSelected ? "on" : ""}`, html: isSelected ? iconSvg("Check", 13) : "" })
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
}
