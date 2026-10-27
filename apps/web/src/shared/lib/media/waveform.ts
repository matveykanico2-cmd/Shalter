// Осциллограмма голосового: уровни 0..1 за запись — в 64 целых 0..31, по пикам
// (packWaveform в public/js/lib/waveform.js).
export const WAVEFORM_POINTS = 64;
const MAX_LEVEL = 31;

export function packWaveform(levels: readonly number[]) {
  if (!levels.length) return undefined;
  const out: number[] = [];
  const step = levels.length / WAVEFORM_POINTS;
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]!);
    out.push(peak);
  }
  const max = Math.max(...out) || 1;
  return out.map((v) => Math.round((v / max) * MAX_LEVEL));
}

// Старые голосовые без осциллограммы: считаем её из самого файла (decodeWaveform в
// public/js/lib/waveform.js) — те же 64 пика, что у новой записи. Не больше двух
// декодирований сразу, результат кэшируется по url (в памяти и в sessionStorage).
const MAX_ACTIVE = 2;
const STORAGE_PREFIX = "shalter:waveform:";
const decoded = new Map<string, Promise<number[] | null>>();
const queue: (() => Promise<void>)[] = [];
let active = 0;

type OfflineCtx = new (channels: number, length: number, sampleRate: number) => BaseAudioContext;
const offlineContext = () =>
  (globalThis as { OfflineAudioContext?: OfflineCtx; webkitOfflineAudioContext?: OfflineCtx }).OfflineAudioContext ??
  (globalThis as { webkitOfflineAudioContext?: OfflineCtx }).webkitOfflineAudioContext;

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const job = queue.shift()!;
    active++;
    void job().finally(() => {
      active--;
      pump();
    });
  }
}

function stored(url: string) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + url);
    const wave: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(wave) && wave.length && wave.every((v) => typeof v === "number") ? (wave as number[]) : null;
  } catch {
    return null;
  }
}

function store(url: string, wave: number[]) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + url, JSON.stringify(wave));
  } catch {
    // Хранилище закрыто или полно — хватит кэша в памяти.
  }
}

/** Уровни (RMS) кусками — столько, чтобы на каждый из 64 пиков пришлось по четыре. */
export function audioLevels(data: Float32Array) {
  const chunk = Math.max(1, Math.floor(data.length / (WAVEFORM_POINTS * 4)));
  const levels: number[] = [];
  for (let i = 0; i < data.length; i += chunk) {
    const end = Math.min(data.length, i + chunk);
    let sum = 0;
    for (let j = i; j < end; j++) sum += data[j]! * data[j]!;
    levels.push(Math.sqrt(sum / (end - i)));
  }
  return levels;
}

/** Осциллограмма из аудиофайла (64 целых 0..31) или null, если не вышло — тогда столбики ровные. */
export function decodeWaveform(url: string): Promise<number[] | null> {
  const cached = decoded.get(url);
  if (cached) return cached;
  const fromStorage = stored(url);
  if (fromStorage) {
    const done = Promise.resolve(fromStorage);
    decoded.set(url, done);
    return done;
  }
  const Ctx = offlineContext();
  if (!Ctx || typeof fetch !== "function") return Promise.resolve(null);
  const promise = new Promise<number[] | null>((resolve) => {
    queue.push(async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const audio = await new Ctx(1, 1, 8000).decodeAudioData(await res.arrayBuffer());
        const wave = packWaveform(audioLevels(audio.getChannelData(0))) ?? null;
        if (wave) store(url, wave);
        resolve(wave);
      } catch {
        resolve(null);
      }
    });
    pump();
  });
  decoded.set(url, promise);
  return promise;
}

/** Для тестов: забыть посчитанное. */
export function resetDecodedWaveforms() {
  decoded.clear();
  queue.length = 0;
  active = 0;
}
