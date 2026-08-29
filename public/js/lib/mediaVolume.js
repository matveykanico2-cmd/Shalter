// Громкость входящего звука — общая для звонков и эфиров.
//
// До этого её не было вовсе: собеседника слушали на той громкости, какую даст
// система, и «сделайте потише» решалось только общим ползунком всего
// компьютера. Здесь громкость своя, на приложение, и она запоминается — иначе
// её пришлось бы выставлять заново на каждый звонок.
//
// Работает через свойство volume у <video>/<audio>, а не через WebAudio: это
// одна строка, работает во всех браузерах и не требует AudioContext, который
// на телефонах ещё нужно «разбудить» жестом. Цена — потолок ровно 100%,
// усилить тише записанного собеседника нельзя.
const KEY = "shalter.mediaVolume";
const listeners = new Set();

function read() {
  try {
    const stored = localStorage.getItem(KEY);
    // Отдельная проверка на null обязательна: getItem у несохранённого ключа
    // возвращает null, а Number(null) — это 0, и он проходит проверку диапазона
    // как совершенно законная громкость. Без этой строки каждый, кто ни разу не
    // трогал ползунок, начинал звонок с полной тишиной.
    if (stored === null) return 1;
    const raw = Number(stored);
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
  } catch {
    // Приватный режим или запрет на хранилище — просто громкость по умолчанию.
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

// Своё видео всегда идёт с muted: у него громкость трогать нельзя, иначе
// человек слышит сам себя с задержкой. Поэтому заглушённые элементы
// пропускаются — это и есть признак «это моя картинка, а не собеседник».
export function applyVolume(node) {
  if (!node || node.muted) return;
  try {
    node.volume = volume;
  } catch {
    // Элемент уже снят с экрана.
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
    // Не сохранилось — на эту сессию громкость всё равно применится.
  }
  applyVolumeToAll();
  for (const fn of listeners) fn(volume);
}
