import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { formatText } from "../lib/formatText.js";
import { api } from "../api.js";
import { openReportDialog } from "./reportDialog.js";

const QUICK_EMOJI = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"];

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function ImageAttachment(a) {
  return el("img", { src: a.url, alt: a.name || "photo", class: "image-attachment" });
}

function VideoAttachment(a) {
  return el("video", { src: a.url, controls: true, class: "video-attachment" });
}

function FileAttachment(a) {
  return el("a", { href: a.url, download: a.name || "file", class: "file-attachment" }, [
    el("span", { html: iconSvg("Download", 18) }),
    el("div", { class: "file-attachment-info" }, [
      el("p", { class: "file-attachment-name" }, a.name || "Файл"),
      el("p", { class: "mono file-attachment-size" }, a.size ? `${(a.size / 1024).toFixed(0)} КБ` : ""),
    ]),
  ]);
}

function LocationAttachment(a) {
  const { lat, lng } = a.meta ?? {};
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  return el("a", { href: mapUrl, target: "_blank", rel: "noreferrer", class: "location-attachment" }, [
    el("span", { html: iconSvg("Pin", 18) }),
    el("div", {}, [
      el("p", {}, "Геолокация"),
      el("p", { class: "mono location-coords" }, `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`),
    ]),
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

  const bubbleInner = [];

  if (message.forwardedFrom) {
    bubbleInner.push(
      el("p", { class: "forwarded-banner" }, [
        el("span", { html: iconSvg("Forward", 12) }),
        ` Переслано от ${message.forwardedFrom.senderName}`,
      ])
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
  if (message.attachments?.length) {
    for (const a of message.attachments) {
      if (a.kind === "poll") bubbleInner.push(PollAttachment(message, a, me, onVote));
      else if (a.kind === "voice") bubbleInner.push(VoicePlayer(a));
      else if (a.kind === "video-note") bubbleInner.push(VideoNotePlayer(a));
      else if (a.kind === "image") bubbleInner.push(ImageAttachment(a));
      else if (a.kind === "video") bubbleInner.push(VideoAttachment(a));
      else if (a.kind === "file") bubbleInner.push(FileAttachment(a));
      else if (a.kind === "location") bubbleInner.push(LocationAttachment(a));
      else if (a.kind === "contact") bubbleInner.push(ContactAttachment(a));
    }
  }
  if (!message.attachments?.some((a) => a.kind === "poll")) {
    bubbleInner.push(el("span", { class: "message-text" }, formatText(message.text)));
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
