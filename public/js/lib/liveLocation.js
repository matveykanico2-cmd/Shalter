import { api } from "../api.js";

const UPDATE_INTERVAL_MS = 10_000;

let active = null;

export function isSharingLiveLocation(messageId) {
  return active?.messageId === messageId;
}

export function stopLiveLocationSharing() {
  if (!active) return;
  clearInterval(active.timer);
  active = null;
}

export function startLiveLocationSharing(chatId, messageId, durationMs) {
  if (!navigator.geolocation) return;
  stopLiveLocationSharing();
  const stopAt = Date.now() + durationMs;

  function tick() {
    if (Date.now() >= stopAt) return stopLiveLocationSharing();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api.updateLiveLocation(chatId, messageId, pos.coords.latitude, pos.coords.longitude).catch(() => {});
      },
      () => {},
      { maximumAge: 5000, timeout: 8000 }
    );
  }

  const timer = setInterval(tick, UPDATE_INTERVAL_MS);
  active = { chatId, messageId, timer, stopAt };
  setTimeout(stopLiveLocationSharing, durationMs);
}
