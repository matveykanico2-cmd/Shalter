import { api } from "../api.js";

// Живая геолокация — периодический пинг координат для одного сообщения,
// пока не истечёт заданное окно. Один общий модуль (не привязан к конкретному
// открытому чату): деление продолжается, даже если человек ушёл в другой чат,
// пока вкладка открыта — то же ощущение, что и у нативных приложений, в
// пределах того, что вообще возможно без бэкграунд-воркера службы.
const UPDATE_INTERVAL_MS = 10_000;

let active = null; // { chatId, messageId, timer, stopAt }

export function isSharingLiveLocation(messageId) {
  return active?.messageId === messageId;
}

export function stopLiveLocationSharing() {
  if (!active) return;
  clearInterval(active.timer);
  active = null;
}

// durationMs — то же окно, что уже отправлено на сервер в meta.liveMinutes
// (composer.js): сервер — источник истины по expiresAt, это только чтобы
// клиент сам не пытался слать обновления в пустоту после истечения окна.
export function startLiveLocationSharing(chatId, messageId, durationMs) {
  if (!navigator.geolocation) return;
  stopLiveLocationSharing(); // на устройстве отправляется только одна живая геолокация одновременно
  const stopAt = Date.now() + durationMs;

  function tick() {
    if (Date.now() >= stopAt) return stopLiveLocationSharing();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api.updateLiveLocation(chatId, messageId, pos.coords.latitude, pos.coords.longitude).catch(() => {});
      },
      () => {}, // временная ошибка (потеря сигнала) — просто пропускаем этот тик
      { maximumAge: 5000, timeout: 8000 }
    );
  }

  const timer = setInterval(tick, UPDATE_INTERVAL_MS);
  active = { chatId, messageId, timer, stopAt };
  setTimeout(stopLiveLocationSharing, durationMs);
}
