// Общий плеер голосовых и музыки, как в Telegram Web: пока что-то играет,
// под шапкой чата висит полоска с автором, паузой, скоростью и закрытием.
// Звук не обрывается при переходе в другой чат, а после голосового
// автоматически запускается следующее голосовое из той же ленты.

const listeners = new Set();
let current = null; // { media, title, subtitle, chatId, messageId, kind, next }
let rate = 1;
try {
  rate = Number(localStorage.getItem("shalter.playbackRate")) || 1;
} catch {
}

function emit() {
  for (const fn of listeners) fn(current);
}

export function subscribePlayer(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

export function getPlaybackRate() {
  return rate;
}

export function cyclePlaybackRate() {
  rate = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
  try {
    localStorage.setItem("shalter.playbackRate", String(rate));
  } catch {
  }
  if (current) current.media.playbackRate = rate;
  emit();
  return rate;
}

function onMediaEvent() {
  emit();
}

function onEnded() {
  const finished = current;
  if (!finished) return;
  // Следующее голосовое — ищем в DOM ленты ниже текущего, как в Telegram.
  const nextBtn = finished.kind === "voice" ? findNextVoice(finished.media) : null;
  detach();
  current = null;
  emit();
  if (nextBtn) nextBtn.click();
}

function findNextVoice(media) {
  const all = [...document.querySelectorAll(".voice-msg")];
  const mine = media.closest(".voice-msg");
  const i = all.indexOf(mine);
  return i >= 0 ? all[i + 1]?.querySelector(".voice-msg-play") ?? null : null;
}

function detach() {
  if (!current) return;
  const m = current.media;
  m.removeEventListener("play", onMediaEvent);
  m.removeEventListener("pause", onMediaEvent);
  m.removeEventListener("ended", onEnded);
}

// Вызывается плеером в пузыре, когда его аудио начинает играть.
export function setNowPlaying(media, info) {
  if (current?.media === media) {
    emit();
    return;
  }
  if (current) {
    try {
      current.media.pause();
    } catch {
    }
    detach();
  }
  media.playbackRate = rate;
  current = { media, ...info };
  media.addEventListener("play", onMediaEvent);
  media.addEventListener("pause", onMediaEvent);
  media.addEventListener("ended", onEnded);
  emit();
}

// Пузырь при перерисовке ленты создаётся заново — если его запись уже играет,
// он подхватывает тот же <audio>, а не заводит новый.
export function playingMediaFor(key) {
  return key && current?.key === key ? current.media : null;
}

export function togglePlayback() {
  if (!current) return;
  if (current.media.paused) current.media.play().catch(() => {});
  else current.media.pause();
}

export function stopPlayback() {
  if (!current) return;
  try {
    current.media.pause();
    current.media.currentTime = 0;
  } catch {
  }
  detach();
  current = null;
  emit();
}
