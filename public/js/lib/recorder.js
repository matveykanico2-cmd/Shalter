import { getFlippedTrack } from "./cameraSwitch.js";
export const MAX_RECORD_SEC = 180;

// Высокое качество: кружок 640×640 при 3,5 Мбит/с, голос — Opus 128 кбит/с 48 кГц
// (у Telegram кружок ~400 px и голос ~32 кбит/с).
const VIDEO_NOTE_BITRATES = { videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000 };
const VOICE_BITRATES = { audioBitsPerSecond: 128_000 };
const SQUARE_SIZE = 640;
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

// На телефоне — H.264: его кодирует видеочип. VP9 там кодируется процессором, не
// успевает в реальном времени и снижает качество/пропускает кадры (кружки «мылились»).
const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
function pickMime(kind) {
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"]
      : MOBILE
        ? ["video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
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

// Ждём первый настоящий кадр видео (не дольше 1,5 с).
// true — кадр получен, false — таймаут.
function firstFrame(video) {
  return new Promise((resolve) => {
    const ok = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => resolve(false), 1500);
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => ok());
    else {
      const start = Date.now();
      (function check() {
        if (video.readyState >= 2 && video.videoWidth) return ok();
        if (Date.now() - start > 1400) return ok();
        requestAnimationFrame(check);
      })();
    }
  });
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

  let camVideo = document.createElement("video");
  camVideo.muted = true;
  camVideo.playsInline = true;
  camVideo.srcObject = camStream;
  await camVideo.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = SQUARE_SIZE;
  canvas.height = SQUARE_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "high";
  let facingBack = false;
  // Квадрат из центра кадра — без растягивания, как кружки в Telegram. Фронталку
  // отражаем, как зеркало: иначе и в превью, и в записи всё «наоборот».
  const drawFrame = () => {
    const w = camVideo.videoWidth || SQUARE_SIZE;
    const h = camVideo.videoHeight || SQUARE_SIZE;
    const side = Math.min(w, h);
    ctx.setTransform(facingBack ? 1 : -1, 0, 0, 1, facingBack ? 0 : SQUARE_SIZE, 0);
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
  // Пока переключаем камеру, кадры не рисуем: на холсте остаётся последний.
  let switching = false;
   (function draw() {
     if (!drawing) return;
     if (!switching && camVideo.readyState >= 2 && camVideo.videoWidth > 0) drawFrame();
     requestAnimationFrame(draw);
   })();

  const canvasStream = canvas.captureStream(30);
  const finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...camStream.getAudioTracks()]);

  async function flipCamera() {
    const currentTrack = camStream.getVideoTracks()[0] ?? null;
    // Замораживаем кадр сразу: на части телефонов старую камеру приходится
    // остановить до открытия новой.
    switching = true;
    const { track, error } = await getFlippedTrack({
      currentTrack,
      wantBack: !facingBack,
      video: { width: CAMERA_VIDEO.width, height: CAMERA_VIDEO.height, frameRate: CAMERA_VIDEO.frameRate },
    });
    if (!track) {
      switching = false;
      return { error };
    }

    // Новую камеру грузим в отдельный <video> и подменяем источник кадров только
    // после её первого кадра — до этого в кружке остаётся последний кадр старой
    // камеры, а не чёрный экран (остановленный трек отдаёт чёрные кадры).
    const oldVideoTracks = camStream.getVideoTracks();
    const nextStream = new MediaStream([track, ...camStream.getAudioTracks()]);
    const nextVideo = document.createElement("video");
    nextVideo.muted = true;
    nextVideo.playsInline = true;
    nextVideo.srcObject = nextStream;
    await nextVideo.play().catch(() => {});
    const gotFrame = await firstFrame(nextVideo);
    if (!drawing) {
      // Запись закончилась, пока камера переключалась.
      track.stop();
      nextVideo.srcObject = null;
      return { error: "Запись уже остановлена" };
    }
    // firstFrame может не дозвучать — тогда в кадре черный экран.
    // Держим старую камеру, пока новая не даст первый кадр.
    if (!gotFrame) {
      switching = false;
      track.stop();
      nextVideo.srcObject = null;
      return { error: "Камера не отдала кадр" };
    }
    const oldVideo = camVideo;
    camVideo = nextVideo;
    camStream = nextStream;
    switching = false;
    oldVideoTracks.forEach((t) => t.stop());
    oldVideo.pause();
    oldVideo.srcObject = null;
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
