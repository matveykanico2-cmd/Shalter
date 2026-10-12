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

function beep(when, duration, freq) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.15, when + 0.02);
  gain.gain.linearRampToValueAtTime(0, when + duration - 0.02);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + duration);
}

function loop(pattern, cycleSec) {
  let cancelled = false;
  const audioCtx = getCtx();

  function scheduleCycle(startAt) {
    if (cancelled) return;
    for (const [offset, duration, freq] of pattern) beep(startAt + offset, duration, freq);
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
  activeStop = loop(
    [
      [0, 0.3, 520],
      [0.35, 0.3, 620],
    ],
    1.4
  );
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
    const t = getCtx().currentTime;
    beep(t, 0.12, 880);
    beep(t + 0.13, 0.16, 1175);
  } catch {}
}

export function playSentSound() {
  try {
    const t = getCtx().currentTime;
    beep(t, 0.09, 660);
    beep(t + 0.07, 0.1, 990);
  } catch {}
}
