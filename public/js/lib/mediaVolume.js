const KEY = "shalter.mediaVolume";
const listeners = new Set();

function read() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === null) return 1;
    const raw = Number(stored);
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
  } catch {
    return 1;
  }
}

let volume = read();

export function getVolume() {
  return volume;
}

export function subscribeVolume(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyVolume(node) {
  if (!node || node.muted) return;
  try {
    node.volume = volume;
  } catch {
  }
}

export function applyVolumeToAll(root = document) {
  root.querySelectorAll?.("video, audio").forEach(applyVolume);
}

export function setVolume(next) {
  const clamped = Math.min(1, Math.max(0, Number(next)));
  if (!Number.isFinite(clamped) || clamped === volume) return;
  volume = clamped;
  try {
    localStorage.setItem(KEY, String(volume));
  } catch {
  }
  applyVolumeToAll();
  for (const fn of listeners) fn(volume);
}
