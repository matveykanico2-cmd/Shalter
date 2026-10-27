let ctx = null;
let activeStop = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}

// iPhone: звук разрешается только из касания. Контекст, созданный позже (пришло
// сообщение, звонок), оставался «suspended» — звуков и гудков не было. Включаем его
// на касании; iOS снова приостанавливает его после сворачивания, поэтому слушаем всегда.
function unlockAudio() {
  try {
    const audioCtx = getCtx();
    if (audioCtx.state === "running") return;
    // Тихий звук в момент касания — так iOS считает контекст «запущенным пользователем».
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination);
    src.start(0);
  } catch {}
}
if (typeof window !== "undefined") {
  for (const type of ["touchend", "pointerdown", "keydown"]) window.addEventListener(type, unlockAudio, { passive: true, capture: true });
}

// Нота: when/duration в секундах, freq — Гц. type — форма волны, glide — к какой
// частоте скользить (капля, пузырь), vol — громкость.
function beep(when, duration, freq, { type = "sine", glide = null, vol = 0.15 } = {}) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, when + duration);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol, when + Math.min(0.02, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

// Колокольчик: основной тон и обертоны, затухает долго.
function bell(when, freq, vol = 0.12) {
  beep(when, 0.9, freq, { type: "sine", vol });
  beep(when, 0.6, freq * 2.01, { type: "sine", vol: vol * 0.4 });
  beep(when, 0.35, freq * 3.02, { type: "sine", vol: vol * 0.2 });
}

// Мягкая капля: плавный скользящий тон, как у современных мессенджеров.
function drop(when, freq, vol = 0.14) {
  beep(when, 0.18, freq, { type: "sine", glide: freq * 0.6, vol });
}

// Аккордная арпеггия: несколько нот подряд, приятно на слух.
function arpeggio(when, baseFreq, vol = 0.09) {
  [1, 1.25, 1.5, 2].forEach((ratio, i) => beep(when + i * 0.05, 0.3, baseFreq * ratio, { type: "triangle", vol }));
}

// Звуки — синтез, файлов нет. Выбор — на этом устройстве (Настройки → Уведомления).
const SOUNDS_KEY = "shalter.sounds";
export const MESSAGE_SOUNDS = [
  { id: "classic", label: "Классика", play: (t) => (beep(t, 0.12, 880), beep(t + 0.13, 0.16, 1175)) },
  { id: "drop", label: "Капля", play: (t) => drop(t, 1400) },
  { id: "bubble", label: "Пузырь", play: (t) => (beep(t, 0.12, 400, { glide: 900, vol: 0.18 }), beep(t + 0.1, 0.1, 700, { glide: 1300, vol: 0.12 })) },
  { id: "bell", label: "Колокольчик", play: (t) => bell(t, 1318) },
  { id: "chord", label: "Аккорд", play: (t) => [523, 659, 784, 1047].forEach((f, i) => beep(t + i * 0.06, 0.35, f, { type: "triangle", vol: 0.1 })) },
  { id: "harp", label: "Арфа", play: (t) => arpeggio(t, 523) },
  { id: "soft", label: "Мягкий", play: (t) => (beep(t, 0.15, 659, { type: "sine", vol: 0.1 }), beep(t + 0.14, 0.18, 880, { type: "sine", vol: 0.12 })) },
  { id: "retro", label: "Ретро", play: (t) => (beep(t, 0.07, 988, { type: "square", vol: 0.05 }), beep(t + 0.08, 0.12, 1319, { type: "square", vol: 0.05 })) },
  { id: "none", label: "Без звука", play: () => {} },
];
export const RINGTONES = [
  { id: "classic", label: "Классика", cycle: 1.4, play: (t) => (beep(t, 0.3, 520), beep(t + 0.35, 0.3, 620)) },
  { id: "melody", label: "Мелодия", cycle: 2.2, play: (t) => [523, 659, 784, 1047, 784, 659].forEach((f, i) => beep(t + i * 0.16, 0.22, f, { type: "triangle", vol: 0.13 })) },
  { id: "marimba", label: "Маримба", cycle: 2, play: (t) => [784, 988, 784, 1175].forEach((f, i) => bell(t + i * 0.2, f, 0.11)) },
  { id: "retro", label: "Ретро", cycle: 1.6, play: (t) => [659, 784, 1047, 784].forEach((f, i) => beep(t + i * 0.12, 0.1, f, { type: "square", vol: 0.05 })) },
  { id: "soft", label: "Нежный", cycle: 3, play: (t) => [392, 494, 587].forEach((f, i) => beep(t + i * 0.35, 1.2, f, { type: "sine", vol: 0.1 })) },
  { id: "bell", label: "Колокольчик", cycle: 2.5, play: (t) => bell(t, 659) },
];

function soundPrefs() {
  try {
    return JSON.parse(localStorage.getItem(SOUNDS_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}
export function getSoundChoice() {
  const p = soundPrefs();
  return { message: p.message ?? "classic", ringtone: p.ringtone ?? "classic" };
}
export function setSoundChoice(kind, id) {
  try {
    localStorage.setItem(SOUNDS_KEY, JSON.stringify({ ...soundPrefs(), [kind]: id }));
  } catch {}
}
const pick = (list, id) => list.find((x) => x.id === id) ?? list[0];

// Прослушать в настройках: звук сообщения целиком, рингтон — один круг.
export function previewSound(kind, id) {
  try {
    const t = getCtx().currentTime + 0.02;
    pick(kind === "ringtone" ? RINGTONES : MESSAGE_SOUNDS, id).play(t);
  } catch {}
}

function loop(pattern, cycleSec) {
  let cancelled = false;
  const audioCtx = getCtx();

  function scheduleCycle(startAt) {
    if (cancelled) return;
    if (typeof pattern === "function") pattern(startAt);
    else for (const [offset, duration, freq] of pattern) beep(startAt + offset, duration, freq);
    setTimeout(() => scheduleCycle(audioCtx.currentTime), cycleSec * 1000);
  }
  scheduleCycle(audioCtx.currentTime);

  return () => {
    cancelled = true;
  };
}

export function startRingback() {
  stopRingtone();
  activeStop = loop(
    [
      [0, 0.4, 440],
      [0.5, 0.4, 480],
    ],
    3
  );
}

export function startRingtone() {
  stopRingtone();
  const tone = pick(RINGTONES, getSoundChoice().ringtone);
  activeStop = loop(tone.play, tone.cycle);
}

export function stopRingtone() {
  activeStop?.();
  activeStop = null;
}

// Short one-shot cues for chat traffic — same synth as the ringtones, no audio
// files to ship. Both respect the "Звук" notification setting at the call site.
let lastIncomingAt = 0;
export function playIncomingMessageSound() {
  const now = Date.now();
  if (now - lastIncomingAt < 1200) return;
  lastIncomingAt = now;
  try {
    pick(MESSAGE_SOUNDS, getSoundChoice().message).play(getCtx().currentTime);
  } catch {}
}

export function playSentSound() {
  try {
    const t = getCtx().currentTime;
    beep(t, 0.08, 880);
    beep(t + 0.06, 0.1, 1320);
  } catch {}
}
