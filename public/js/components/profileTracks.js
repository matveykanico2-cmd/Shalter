import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Музыка в профиле, как в Telegram: компактная карточка основного трека (▶, название,
// прогресс, «ещё N»), а по нажатию на карточку — список всех треков. Играет один трек
// на всё приложение: общий <audio>, новая кнопка ▶ останавливает предыдущую.

const audio = new Audio();
audio.preload = "none";
let playingUrl = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
for (const ev of ["play", "pause", "ended", "timeupdate", "loadedmetadata"]) audio.addEventListener(ev, notify);
audio.addEventListener("ended", () => {
  playingUrl = null;
  notify();
});

function toggle(track) {
  if (playingUrl === track.url && !audio.paused) return audio.pause();
  if (playingUrl !== track.url) {
    audio.src = track.url;
    playingUrl = track.url;
  }
  audio.play().catch(() => {});
}

const isPlaying = (track) => playingUrl === track.url && !audio.paused;

function trackTitle(track) {
  return String(track.name || "Трек").replace(/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i, "");
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeLabel(track) {
  if (playingUrl === track.url && Number.isFinite(audio.duration)) {
    return `${fmtTime(audio.currentTime) || "0:00"} / ${fmtTime(audio.duration)}`;
  }
  return fmtTime(track.duration);
}

function playButton(track, size = 40) {
  const btn = el("button", {
    type: "button",
    class: "ptrack-play",
    style: { width: `${size}px`, height: `${size}px` },
    title: "Слушать",
    onclick: (e) => {
      e.stopPropagation();
      toggle(track);
    },
  });
  const paint = () => {
    btn.innerHTML = iconSvg(isPlaying(track) ? "Pause" : "Play", Math.round(size * 0.45));
    btn.classList.toggle("playing", isPlaying(track));
  };
  paint();
  return { btn, paint };
}

// Подписка на состояние плеера, пока узел в документе.
function live(node, paint) {
  const fn = () => (node.isConnected ? paint() : listeners.delete(fn));
  listeners.add(fn);
}

export function ProfileTrackCard(tracks) {
  const list = (tracks ?? []).filter((t) => t?.url);
  if (!list.length) return null;
  const main = list[0];
  const { btn, paint: paintBtn } = playButton(main);
  const time = el("span", { class: "ptrack-time" });
  const fill = el("span", { class: "ptrack-progress-fill" });
  const card = el(
    "div",
    {
      class: "ptrack-card",
      role: "button",
      tabindex: "0",
      title: list.length > 1 ? "Все треки" : "Трек",
      onclick: () => openTracksSheet(list),
    },
    [
      btn,
      el("div", { class: "ptrack-body" }, [
        el("p", { class: "ptrack-name" }, [el("span", { html: iconSvg("Volume", 13) }), " ", trackTitle(main)]),
        el("div", { class: "ptrack-meta" }, [
          el("span", { class: "ptrack-progress" }, [fill]),
          time,
        ]),
      ]),
      list.length > 1 ? el("span", { class: "ptrack-more" }, `ещё ${list.length - 1}`) : el("span", { class: "ptrack-chevron", html: iconSvg("ChevronRight", 16) }),
    ]
  );
  const paint = () => {
    paintBtn();
    time.textContent = timeLabel(main);
    const ratio = playingUrl === main.url && audio.duration ? audio.currentTime / audio.duration : 0;
    fill.style.width = `${Math.min(100, ratio * 100)}%`;
  };
  paint();
  live(card, paint);
  return card;
}

export function openTracksSheet(tracks) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const listEl = el("div", { class: "ptrack-list" });
  const dialog = el("div", { class: "modal-dialog ptrack-sheet" }, [
    el("div", { class: "ptrack-sheet-head" }, [
      el("h2", { class: "modal-title" }, tracks.length > 1 ? `Треки · ${tracks.length}` : "Трек"),
      el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: () => close() }),
    ]),
    listEl,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  const painters = [];
  clear(listEl);
  tracks.forEach((track, i) => {
    const { btn, paint: paintBtn } = playButton(track, 36);
    const time = el("span", { class: "ptrack-time" });
    const row = el("div", { class: `ptrack-row${i === 0 ? " main" : ""}`, onclick: () => toggle(track) }, [
      btn,
      el("div", { class: "ptrack-body" }, [
        el("p", { class: "ptrack-name" }, trackTitle(track)),
        el("span", { class: "ptrack-time-wrap" }, [i === 0 ? el("span", { class: "ptrack-badge" }, "основной") : null, time]),
      ]),
    ]);
    painters.push(() => {
      paintBtn();
      time.textContent = timeLabel(track);
      row.classList.toggle("playing", isPlaying(track));
    });
    listEl.appendChild(row);
  });
  const paintAll = () => painters.forEach((p) => p());
  paintAll();
  live(listEl, paintAll);
}
