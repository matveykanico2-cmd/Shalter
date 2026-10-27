// Громкость звука звонков и эфиров — как public/js/lib/mediaVolume.js: одна на
// устройство, ползунок в звонке меняет её у всех элементов сразу.
const KEY = "shalter.mediaVolume";
const listeners = new Set<(v: number) => void>();

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

export const getVolume = () => volume;

export function subscribeVolume(fn: (v: number) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Громкость на элемент (кроме заглушённых: свои превью камеры). */
export function applyVolume(node: HTMLMediaElement | null) {
  if (!node || node.muted) return;
  try {
    node.volume = volume;
  } catch {
    // iOS не даёт менять громкость из кода.
  }
}

export function setVolume(next: number) {
  const clamped = Math.min(1, Math.max(0, Number(next)));
  if (!Number.isFinite(clamped) || clamped === volume) return;
  volume = clamped;
  try {
    localStorage.setItem(KEY, String(volume));
  } catch {
    // Без сохранения — до перезагрузки.
  }
  listeners.forEach((fn) => fn(volume));
}
