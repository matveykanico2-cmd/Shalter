// Живая геопозиция — как public/js/lib/liveLocation.js: пока идёт срок, раз в 10 с новая
// точка в отправленное сообщение. Делится одно сообщение за раз.
import { updateLiveLocation } from "../api/send-message";

const UPDATE_INTERVAL_MS = 10_000;

let active: { messageId: string; timer: ReturnType<typeof setInterval>; stop: ReturnType<typeof setTimeout> } | null = null;

export function stopLiveLocationSharing() {
  if (!active) return;
  clearInterval(active.timer);
  clearTimeout(active.stop);
  active = null;
}

export function startLiveLocationSharing(chatId: string, messageId: string, durationMs: number) {
  const geo = navigator.geolocation;
  if (!geo) return;
  stopLiveLocationSharing();
  const timer = setInterval(() => {
    geo.getCurrentPosition(
      (pos) => void updateLiveLocation(chatId, messageId, pos.coords.latitude, pos.coords.longitude).catch(() => {}),
      () => {},
      { maximumAge: 5000, timeout: 8000 }
    );
  }, UPDATE_INTERVAL_MS);
  active = { messageId, timer, stop: setTimeout(stopLiveLocationSharing, durationMs) };
}
