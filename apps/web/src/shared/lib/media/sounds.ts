// Звуки — синтез без файлов, как public/js/lib/ringtone.js: выбранный звук входящего
// (Настройки → Уведомления, на этом устройстве), короткий «отправлено», рингтон входящего
// звонка и гудки у звонящего.

type Ctx = AudioContext;
let ctx: Ctx | null = null;

// Старый iOS Safari знает только webkitAudioContext (AudioContext || webkitAudioContext в ringtone.js).
const audioCtor = (): typeof AudioContext | undefined =>
  typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

function getCtx(): Ctx {
  const AudioCtor = audioCtor();
  if (!ctx) ctx = new AudioCtor!();
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}

// iPhone: звук разрешается только из касания — включаем контекст на любом касании или клавише.
function unlockAudio() {
  try {
    const audio = getCtx();
    if (audio.state === "running") return;
    const src = audio.createBufferSource();
    src.buffer = audio.createBuffer(1, 1, 22050);
    src.connect(audio.destination);
    src.start(0);
  } catch {
    // Звука нет — ничего страшного.
  }
}

let unlocked = false;
/** Подписка на первое касание — один раз, при входе в приложение. */
export function installSoundUnlock() {
  if (unlocked || !audioCtor()) return;
  unlocked = true;
  for (const type of ["touchend", "pointerdown", "keydown"]) window.addEventListener(type, unlockAudio, { passive: true, capture: true });
}

type BeepOptions = { type?: OscillatorType; glide?: number | null; vol?: number };

function beep(when: number, duration: number, freq: number, { type = "sine", glide = null, vol = 0.15 }: BeepOptions = {}) {
  const audio = getCtx();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, when + duration);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol, when + Math.min(0.02, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function bell(when: number, freq: number, vol = 0.12) {
  beep(when, 0.9, freq, { type: "sine", vol });
  beep(when, 0.6, freq * 2.01, { type: "sine", vol: vol * 0.4 });
  beep(when, 0.35, freq * 3.02, { type: "sine", vol: vol * 0.2 });
}

const SOUNDS_KEY = "shalter.sounds";

export const MESSAGE_SOUNDS: { id: string; label: string; play: (t: number) => void }[] = [
  { id: "classic", label: "Классика", play: (t) => (beep(t, 0.12, 880), beep(t + 0.13, 0.16, 1175)) },
  { id: "drop", label: "Капля", play: (t) => beep(t, 0.22, 1400, { glide: 500, vol: 0.18 }) },
  { id: "bubble", label: "Пузырь", play: (t) => (beep(t, 0.12, 400, { glide: 900, vol: 0.18 }), beep(t + 0.1, 0.1, 700, { glide: 1300, vol: 0.12 })) },
  { id: "bell", label: "Колокольчик", play: (t) => bell(t, 1318) },
  { id: "chord", label: "Аккорд", play: (t) => [523, 659, 784, 1047].forEach((f, i) => beep(t + i * 0.06, 0.35, f, { type: "triangle", vol: 0.1 })) },
  { id: "retro", label: "Ретро", play: (t) => (beep(t, 0.07, 988, { type: "square", vol: 0.05 }), beep(t + 0.08, 0.12, 1319, { type: "square", vol: 0.05 })) },
  { id: "none", label: "Без звука", play: () => {} },
];

export const RINGTONES: { id: string; label: string; cycle: number; play: (t: number) => void }[] = [
  { id: "classic", label: "Классика", cycle: 1.4, play: (t) => (beep(t, 0.3, 520), beep(t + 0.35, 0.3, 620)) },
  { id: "melody", label: "Мелодия", cycle: 2.2, play: (t) => [523, 659, 784, 1047, 784, 659].forEach((f, i) => beep(t + i * 0.16, 0.22, f, { type: "triangle", vol: 0.13 })) },
  { id: "marimba", label: "Маримба", cycle: 2, play: (t) => [784, 988, 784, 1175].forEach((f, i) => bell(t + i * 0.2, f, 0.11)) },
  { id: "retro", label: "Ретро", cycle: 1.6, play: (t) => [659, 784, 1047, 784].forEach((f, i) => beep(t + i * 0.12, 0.1, f, { type: "square", vol: 0.05 })) },
  { id: "soft", label: "Нежный", cycle: 3, play: (t) => [392, 494, 587].forEach((f, i) => beep(t + i * 0.35, 1.2, f, { type: "sine", vol: 0.1 })) },
];

function soundChoice(kind: "message" | "ringtone") {
  try {
    return (JSON.parse(localStorage.getItem(SOUNDS_KEY) || "{}") as Record<string, string | undefined>)?.[kind] ?? "classic";
  } catch {
    return "classic";
  }
}

let lastIncomingAt = 0;

/** Входящее — не чаще раза в 1,2 с, выбранным звуком. */
export function playIncomingMessageSound(now = Date.now()) {
  if (now - lastIncomingAt < 1200) return;
  lastIncomingAt = now;
  try {
    (MESSAGE_SOUNDS.find((s) => s.id === soundChoice("message")) ?? MESSAGE_SOUNDS[0]!).play(getCtx().currentTime);
  } catch {
    // Нет AudioContext (старый браузер, тесты) — без звука.
  }
}

/** Своё сообщение ушло. */
export function playSentSound() {
  try {
    const t = getCtx().currentTime;
    beep(t, 0.09, 660);
    beep(t + 0.07, 0.1, 990);
  } catch {
    // Без звука.
  }
}

let stopActive: (() => void) | null = null;

// Повтор рисунка звука раз в cycle секунд, пока не остановят.
function loop(play: (t: number) => void, cycleSec: number) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const audio = getCtx();
  const cycle = (at: number) => {
    if (cancelled) return;
    play(at);
    timer = setTimeout(() => cycle(audio.currentTime), cycleSec * 1000);
  };
  cycle(audio.currentTime);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

function startLoop(play: (t: number) => void, cycleSec: number) {
  stopRingtone();
  try {
    stopActive = loop(play, cycleSec);
  } catch {
    // Нет AudioContext — без звука.
  }
}

/** Гудки у звонящего, пока не ответили. */
export function startRingback() {
  startLoop((t) => (beep(t, 0.4, 440), beep(t + 0.5, 0.4, 480)), 3);
}

/** Входящий звонок — выбранным рингтоном. */
export function startRingtone() {
  const tone = RINGTONES.find((r) => r.id === soundChoice("ringtone")) ?? RINGTONES[0]!;
  startLoop(tone.play, tone.cycle);
}

export function stopRingtone() {
  stopActive?.();
  stopActive = null;
}
