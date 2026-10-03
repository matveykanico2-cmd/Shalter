// Осциллограмма голосовых: при записи копим уровни громкости и отправляем их
// вместе с вложением (WAVEFORM_POINTS чисел 0..31). Для старых голосовых, где
// осциллограммы нет, считаем её из самого аудио — лениво, когда пузырь виден.

export const WAVEFORM_POINTS = 64;
const MAX_LEVEL = 31;

// Сжимает произвольный ряд уровней 0..1 в WAVEFORM_POINTS целых 0..31.
export function packWaveform(levels) {
  if (!levels?.length) return undefined;
  const out = [];
  const step = levels.length / WAVEFORM_POINTS;
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]);
    out.push(peak);
  }
  const max = Math.max(...out) || 1;
  return out.map((v) => Math.round((v / max) * MAX_LEVEL));
}

// Пересэмплирует сохранённую осциллограмму под нужное число столбиков.
export function resampleWaveform(wave, bars) {
  const out = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * wave.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * wave.length) / bars));
    let sum = 0;
    for (let j = from; j < to; j++) sum += wave[j];
    out.push(sum / (to - from) / MAX_LEVEL);
  }
  return out;
}

const decoded = new Map();
const queue = [];
let active = 0;

function pump() {
  while (active < 2 && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}

// Считает осциллограмму из файла. Промис кэшируется по url.
export function decodeWaveform(url) {
  if (decoded.has(url)) return decoded.get(url);
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) return Promise.resolve(null);
  const promise = new Promise((resolve) => {
    queue.push(async () => {
      try {
        const buf = await (await fetch(url, { credentials: "include" })).arrayBuffer();
        const ctx = new Ctx(1, 1, 8000);
        const audio = await ctx.decodeAudioData(buf);
        const data = audio.getChannelData(0);
        const chunk = Math.max(1, Math.floor(data.length / (WAVEFORM_POINTS * 4)));
        const levels = [];
        for (let i = 0; i < data.length; i += chunk) {
          let sum = 0;
          const end = Math.min(data.length, i + chunk);
          for (let j = i; j < end; j++) sum += data[j] * data[j];
          levels.push(Math.sqrt(sum / (end - i)));
        }
        resolve(packWaveform(levels) ?? null);
      } catch {
        resolve(null);
      }
    });
    pump();
  });
  decoded.set(url, promise);
  return promise;
}
