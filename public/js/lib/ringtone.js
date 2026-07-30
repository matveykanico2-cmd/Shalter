// Actual audible ring — plain Web Audio oscillator, no asset files. Two
// distinct patterns: "ringback" for the caller (waiting for pickup), "ringtone"
// for the callee (incoming banner). Without this a call could silently sit
// in "ringing" with nothing telling either side something is happening.
let ctx = null;
let activeStop = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
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

// Classic two-beep ringback (caller waiting for pickup).
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

// Faster incoming-call ring (callee side).
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
