import { getFlippedTrack } from "./cameraSwitch.js";
export const MAX_RECORD_SEC = 180;

// Высокое качество: кружок 480×480 при 2,5 Мбит/с, голос — Opus 128 кбит/с.
const VIDEO_NOTE_BITRATES = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 };
const VOICE_BITRATES = { audioBitsPerSecond: 128_000 };
const SQUARE_SIZE = 480;
// Просим у камеры HD-кадр: из него вырезается квадрат, поэтому запас по размеру нужен.
const CAMERA_VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" };

const MIC_CONSTRAINTS = {
  channelCount: 1,
  sampleRate: 48_000,
  sampleSize: 16,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function pickMime(kind) {
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"]
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm"];
  return list.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}
const AVATAR_VIDEO_BITRATES = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 };
export const MAX_AVATAR_VIDEO_SEC = 180;
const SQUARE_CAPTURE_MODES = {
  "video-note": { bitrates: VIDEO_NOTE_BITRATES, maxSec: MAX_RECORD_SEC },
  "avatar-video": { bitrates: AVATAR_VIDEO_BITRATES, maxSec: MAX_AVATAR_VIDEO_SEC },
};

export function isRecordingSupported() {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function wireRecorder(stream, mimeType, onTick, extraStop, bitrates, maxSec = MAX_RECORD_SEC) {
  const opts = mimeType && MediaRecorder.isTypeSupported(mimeType) ? { mimeType, ...bitrates } : { ...bitrates };
  const recorder = new MediaRecorder(stream, Object.keys(opts).length ? opts : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let sec = 0;
  let tickTimer = setInterval(() => {
    sec++;
    onTick?.(sec);
  }, 1000);
  let autoStopTimer = null;
  let cancelled = false;

  const result = new Promise((resolve) => {
    recorder.onstop = async () => {
      clearInterval(tickTimer);
      clearTimeout(autoStopTimer);
      stream.getTracks().forEach((t) => t.stop());
      extraStop?.();
      if (cancelled) return resolve(null);
      const baseType = (recorder.mimeType || mimeType).split(";")[0];
      const blob = new Blob(chunks, { type: baseType });
      resolve({ blob, mimeType: blob.type, durationSec: sec });
    };
  });

  recorder.start();
  autoStopTimer = setTimeout(() => recorder.stop(), maxSec * 1000);

  return {
    stop: () => recorder.stop(),
    cancel: () => {
      cancelled = true;
      recorder.stop();
    },
    pause: () => {
      if (recorder.state !== "recording") return false;
      recorder.pause();
      clearInterval(tickTimer);
      clearTimeout(autoStopTimer);
      return true;
    },
    resume: () => {
      if (recorder.state !== "paused") return false;
      recorder.resume();
      tickTimer = setInterval(() => {
        sec++;
        onTick?.(sec);
      }, 1000);
      autoStopTimer = setTimeout(() => recorder.stop(), Math.max(1000, (maxSec - sec) * 1000));
      return true;
    },
    isPaused: () => recorder.state === "paused",
    result,
  };
}

export function createLevelMeter(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !stream.getAudioTracks().length) return null;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  return {
    level() {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += Math.abs(v - 128);
      const raw = Math.min(1, sum / buf.length / 22);
      return Math.pow(raw, 0.62);
    },
    close() {
      try {
        source.disconnect();
        ctx.close();
      } catch {
      }
    },
  };
}

async function getMic(video) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS, ...(video ? { video } : {}) });
  } catch (err) {
    if (err?.name === "NotAllowedError" || err?.name === "NotFoundError") throw err;
    return navigator.mediaDevices.getUserMedia({ audio: true, ...(video ? { video } : {}) });
  }
}

async function startVoiceRecording(onTick) {
  const stream = await getMic();
  const rec = wireRecorder(stream, pickMime("audio"), onTick, undefined, VOICE_BITRATES);
  return { stream, ...rec };
}

async function startSquareVideoRecording(onTick, { bitrates, maxSec }) {
  let camStream = await getMic(CAMERA_VIDEO);

  const camVideo = document.createElement("video");
  camVideo.muted = true;
  camVideo.playsInline = true;
  camVideo.srcObject = camStream;
  await camVideo.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = SQUARE_SIZE;
  canvas.height = SQUARE_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "high";
  // Квадрат из центра кадра — без растягивания, как кружки в Telegram.
  const drawFrame = () => {
    const w = camVideo.videoWidth || SQUARE_SIZE;
    const h = camVideo.videoHeight || SQUARE_SIZE;
    const side = Math.min(w, h);
    ctx.drawImage(camVideo, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SQUARE_SIZE, SQUARE_SIZE);
  };

  await new Promise((resolve) => {
    (function waitForFirstFrame() {
      if (camVideo.readyState >= 2) {
        drawFrame();
        resolve();
      } else {
        requestAnimationFrame(waitForFirstFrame);
      }
    })();
  });

  let drawing = true;
  (function draw() {
    if (!drawing) return;
    if (camVideo.readyState >= 2) drawFrame();
    requestAnimationFrame(draw);
  })();

  const canvasStream = canvas.captureStream(30);
  const finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...camStream.getAudioTracks()]);

  let facingBack = false;
  async function flipCamera() {
    const currentTrack = camStream.getVideoTracks()[0] ?? null;
    const { track, error } = await getFlippedTrack({
      currentTrack,
      wantBack: !facingBack,
      video: { width: CAMERA_VIDEO.width, height: CAMERA_VIDEO.height, frameRate: CAMERA_VIDEO.frameRate },
    });
    if (!track) return { error };

    camStream.getVideoTracks().forEach((t) => t.stop());
    camStream = new MediaStream([track, ...camStream.getAudioTracks()]);
    camVideo.srcObject = camStream;
    await camVideo.play().catch(() => {});
    facingBack = !facingBack;
    return { ok: true };
  }

  const rec = wireRecorder(finalStream, pickMime("video"), onTick, () => {
    drawing = false;
    camStream.getTracks().forEach((t) => t.stop());
    camVideo.pause();
    camVideo.srcObject = null;
  }, bitrates, maxSec);

  const previewStream = new MediaStream(canvasStream.getVideoTracks());
  return { stream: finalStream, previewStream, ...rec, flipCamera };
}

export async function startRecording(mode, { onTick } = {}) {
  if (mode === "voice") return startVoiceRecording(onTick);
  return startSquareVideoRecording(onTick, SQUARE_CAPTURE_MODES[mode] ?? SQUARE_CAPTURE_MODES["video-note"]);
}
