import { el } from "../lib/dom.js";
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
const SPARKLE_ANGLES = [0, 60, 120, 180, 240, 300];
function GiftMessage(gift) {
  return el("div", { class: "gift-message" }, [
    el("div", { class: "gift-message-burst" }, [
      el("div", { class: "gift-message-glow" }),
      ...SPARKLE_ANGLES.map((deg, i) =>
        el("span", { class: "gift-message-sparkle", style: `--angle: ${deg}deg; --delay: ${i * 0.05}s` }, "✨")
      ),
      el("div", { class: "gift-message-emoji" }, gift.emoji),
    ]),
    el("p", { class: "gift-message-name" }, gift.name),
    gift.durationLabel ? el("p", { class: "gift-message-duration" }, gift.durationLabel) : null,
    el("p", { class: "mono gift-message-price" }, `${gift.priceRub}₽`),
  ]);
}

// A sent sticker (public/js/lib/stickers.js) — no bubble/background, just a
// big emoji playing its own named animation (see .sticker-<anim> in
// components.css), same "not a normal chat bubble" slot as .system-message/
// .gift-message.
function StickerMessage(sticker) {
  return el("div", { class: "sticker-message" }, [
    el("span", { class: `sticker-message-emoji sticker-${sticker.anim}` }, sticker.emoji),
  ]);
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

export function MessageBubble({ message, me, sender, showSender, replyToMessage, handlers }) {
  const { onReply, onEdit, onDelete, onReact, onPin, onJumpTo, onForward, onVote, onKeyboardAction } = handlers;
  const mine = message.senderId === me.id;

  if (message.type === "system") {
    return el("div", { class: "system-message" }, message.text);
  }

  if (message.type === "gift" && message.gift) {
    return GiftMessage(message.gift);
  }

  if (message.type === "sticker" && message.sticker) {
    return StickerMessage(message.sticker);
  }

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
  if (!message.attachments?.some((a) => a.kind === "poll")) {
    bubbleInner.push(el("span", { class: "message-text" }, formatText(message.text)));
  }
  if (message.linkPreview) {
    bubbleInner.push(LinkPreviewCard(message.linkPreview));
  }

  const meta = el("span", { class: "message-meta" }, [
    message.editedAt ? el("span", {}, "изменено") : null,
    el("span", { class: "mono" }, timeLabel(message.createdAt)),
    typeof message.views === "number" ? el("span", { class: "mono" }, `· ${message.views} 👁`) : null,
    mine
      ? el("span", { html: iconSvg(message.readByIds.length > 1 ? "CheckCheck" : "Check", 13) })
      : null,
  ]);
  bubbleInner.push(meta);

  const bubble = el("div", { class: `bubble ${mine ? "mine" : ""}` }, bubbleInner);

  const canTranslate = !!message.text?.trim() && !message.attachments?.some((a) => a.kind === "poll");
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
      { icon: "Pin", label: message.pinned ? "Открепить" : "Закрепить", onClick: () => onPin(message) },
      { icon: "Forward", label: "Переслать", onClick: () => onForward(message) },
    ];
    if (canTranslate) {
      items.push({ icon: "Globe", label: translationEl ? "Скрыть перевод" : "Перевести", onClick: toggleTranslation });
    }
    if (voiceAttachment) {
      items.push({ icon: "Mic", label: transcriptEl ? "Скрыть расшифровку" : "Расшифровать", onClick: toggleTranscription });
    }
    if (mine) items.push({ icon: "Edit", label: "Изменить", onClick: () => onEdit(message) });
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

  const bubbleWrap = el("div", {
    class: "bubble-wrap",
    oncontextmenu: (e) => {
      e.preventDefault();
      openMessageMenu({ x: e.clientX, y: e.clientY });
    },
  }, [bubble, hoverActions]);

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
    showSender && !mine && sender ? el("span", { class: "sender-name" }, sender.name) : null,
    bubbleWrap,
    reactionsRow,
    keyboardRows,
  ]);

  return el("div", { class: `message-row ${mine ? "mine" : ""}`, id: `msg-${message.id}` }, [
    !mine ? el("div", { class: "message-avatar-slot" }, showSender && sender ? Avatar({ name: sender.name, color: sender.avatarColor, image: sender.avatarImage, size: 28 }) : null) : null,
    column,
  ]);
}
