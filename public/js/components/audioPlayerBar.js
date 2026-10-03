import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { navigate } from "../router.js";
import { subscribePlayer, togglePlayback, stopPlayback, cyclePlaybackRate, getPlaybackRate } from "../lib/audioPlayer.js";

function clockTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Полоска «сейчас играет» под шапкой чата. Сама подписывается на плеер и
// отписывается, когда её убрали из документа.
export function AudioPlayerBar({ chatId } = {}) {
  const slot = el("div", { class: "audio-bar-slot" });
  let media = null;
  let progressFill = null;
  let timeEl = null;
  let raf = 0;

  const tick = () => {
    raf = 0;
    if (!media || !progressFill) return;
    const dur = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
    progressFill.style.transform = `scaleX(${dur ? Math.min(1, media.currentTime / dur) : 0})`;
    if (timeEl) timeEl.textContent = dur ? `${clockTime(media.currentTime)} / ${clockTime(dur)}` : clockTime(media.currentTime);
    if (!media.paused) raf = requestAnimationFrame(tick);
  };

  const render = (np) => {
    if (!slot.isConnected && slot.dataset.mounted) {
      unsubscribe();
      return;
    }
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clear(slot);
    media = np?.media ?? null;
    if (!np) {
      slot.classList.remove("open");
      return;
    }
    progressFill = el("span", { class: "audio-bar-progress-fill" });
    timeEl = el("span", { class: "audio-bar-time mono" });
    const playing = !np.media.paused;
    slot.classList.add("open");
    slot.append(
      el("div", { class: "audio-bar" }, [
        el("button", {
          class: "icon-btn audio-bar-toggle",
          title: playing ? "Пауза" : "Слушать",
          html: iconSvg(playing ? "PauseFill" : "PlayFill", 20),
          onclick: togglePlayback,
        }),
        el(
          "button",
          {
            class: "audio-bar-info",
            title: "Перейти к сообщению",
            onclick: () => {
              if (!np.chatId || !np.messageId) return;
              if (np.chatId === chatId) {
                window.dispatchEvent(new CustomEvent("shalter:jump-message", { detail: { chatId: np.chatId, messageId: np.messageId } }));
              } else {
                navigate(`/chat/${np.chatId}?msg=${encodeURIComponent(np.messageId)}`);
              }
            },
          },
          [
            el("span", { class: "audio-bar-title" }, np.title || "Аудио"),
            el("span", { class: "audio-bar-subtitle" }, [el("span", {}, np.subtitle || ""), timeEl]),
          ]
        ),
        el(
          "button",
          {
            class: "audio-bar-rate",
            title: "Скорость воспроизведения",
            onclick: (e) => {
              e.currentTarget.textContent = `${cyclePlaybackRate()}×`;
            },
          },
          `${getPlaybackRate()}×`
        ),
        el("button", { class: "icon-btn audio-bar-close", title: "Закрыть", html: iconSvg("X", 18), onclick: stopPlayback }),
      ]),
      el("div", { class: "audio-bar-progress" }, progressFill)
    );
    tick();
  };

  const unsubscribe = subscribePlayer(render);
  requestAnimationFrame(() => {
    slot.dataset.mounted = "1";
  });
  return slot;
}
