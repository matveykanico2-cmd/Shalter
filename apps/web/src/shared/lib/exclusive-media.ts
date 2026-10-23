// Играет что-то одно: новое голосовое, кружок или музыка ставят на паузу прежнее
// (playExclusiveMedia в public/js/lib/audioPlayer.js).
let current: HTMLMediaElement | null = null;

export function playExclusive(media: HTMLMediaElement) {
  if (current && current !== media && !current.paused) current.pause();
  current = media;
}
