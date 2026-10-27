// Запись голосовых и кружков — как public/js/lib/recorder.js. Голос — Opus 128 кбит/с;
// кружок — квадрат 640×640 из центра кадра (фронталка зеркально), 3,5 Мбит/с.
import { getFlippedTrack } from "./camera-switch";

export const MAX_RECORD_SEC = 180;

export type RecordMode = "voice" | "video-note" | "avatar-video";

const VIDEO_NOTE_BITRATES = { videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000 };
const VOICE_BITRATES = { audioBitsPerSecond: 128_000 };
// Видеоаватар — тот же квадрат, чуть легче кружка (SQUARE_CAPTURE_MODES в recorder.js).
const AVATAR_VIDEO_BITRATES = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 };
export const MAX_AVATAR_VIDEO_SEC = 180;
const SQUARE_CAPTURE_MODES = {
  "video-note": { bitrates: VIDEO_NOTE_BITRATES, maxSec: MAX_RECORD_SEC },
  "avatar-video": { bitrates: AVATAR_VIDEO_BITRATES, maxSec: MAX_AVATAR_VIDEO_SEC },
};
const SQUARE_SIZE = 640;
// Из HD-кадра вырезается квадрат — запас по размеру нужен.
const CAMERA_VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" };
const MIC_CONSTRAINTS: MediaTrackConstraints = { channelCount: 1, sampleRate: 48_000, sampleSize: 16, echoCancellation: true, noiseSuppression: true, autoGainControl: true };

// На телефоне — H.264: его кодирует видеочип; VP9 там не успевает, кружки «мылились».
const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
function pickMime(kind: "audio" | "video") {
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"]
      : MOBILE
        ? ["video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
        : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm"];
  return list.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

export const isRecordingSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

export type Recorded = { blob: Blob; mimeType: string; durationSec: number };

export type Recording = {
  stream: MediaStream;
  /** Кружок: что показывать в превью (квадрат с холста). */
  previewStream?: MediaStream;
  stop: () => void;
  cancel: () => void;
  pause: () => boolean;
  resume: () => boolean;
  isPaused: () => boolean;
  flipCamera?: () => Promise<{ ok?: true; error?: string }>;
  /** null — запись отменили. */
  result: Promise<Recorded | null>;
};

function wireRecorder(stream: MediaStream, mimeType: string, bitrates: MediaRecorderOptions, extraStop?: () => void, maxSec = MAX_RECORD_SEC) {
  const opts: MediaRecorderOptions = mimeType && MediaRecorder.isTypeSupported(mimeType) ? { mimeType, ...bitrates } : { ...bitrates };
  const recorder = new MediaRecorder(stream, opts);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  let sec = 0;
  let tick = setInterval(() => sec++, 1000);
  let autoStop = setTimeout(() => recorder.stop(), maxSec * 1000);
  let cancelled = false;

  const result = new Promise<Recorded | null>((resolve) => {
    recorder.onstop = () => {
      clearInterval(tick);
      clearTimeout(autoStop);
      stream.getTracks().forEach((t) => t.stop());
      extraStop?.();
      if (cancelled) return resolve(null);
      const blob = new Blob(chunks, { type: (recorder.mimeType || mimeType).split(";")[0] });
      resolve({ blob, mimeType: blob.type, durationSec: sec });
    };
  });
  recorder.start();

  return {
    stop: () => recorder.state !== "inactive" && recorder.stop(),
    cancel: () => {
      cancelled = true;
      if (recorder.state !== "inactive") recorder.stop();
    },
    pause: () => {
      if (recorder.state !== "recording") return false;
      recorder.pause();
      clearInterval(tick);
      clearTimeout(autoStop);
      return true;
    },
    resume: () => {
      if (recorder.state !== "paused") return false;
      recorder.resume();
      tick = setInterval(() => sec++, 1000);
      autoStop = setTimeout(() => recorder.stop(), Math.max(1000, (maxSec - sec) * 1000));
      return true;
    },
    isPaused: () => recorder.state === "paused",
    result,
  };
}

async function getMic(video?: MediaTrackConstraints) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS, ...(video ? { video } : {}) });
  } catch (err) {
    if ((err as Error)?.name === "NotAllowedError" || (err as Error)?.name === "NotFoundError") throw err;
    return navigator.mediaDevices.getUserMedia({ audio: true, ...(video ? { video } : {}) });
  }
}

/** Первый настоящий кадр камеры (не дольше 1,5 с): true — кадр есть, false — не дождались. */
export function firstFrame(video: HTMLVideoElement) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 1500);
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => finish(true));
    else {
      // Без requestVideoFrameCallback размер видео бывает виден с опозданием — под конец
      // ожидания считаем, что кадр есть (как в public/js/lib/recorder.js).
      const start = Date.now();
      (function check() {
        if (settled) return;
        if ((video.readyState >= 2 && video.videoWidth) || Date.now() - start > 1400) return finish(true);
        requestAnimationFrame(check);
      })();
    }
  });
}

async function startSquareVideo({ bitrates, maxSec }: (typeof SQUARE_CAPTURE_MODES)[keyof typeof SQUARE_CAPTURE_MODES]): Promise<Recording> {
  let camStream = await getMic(CAMERA_VIDEO);
  let camVideo = document.createElement("video");
  camVideo.muted = true;
  camVideo.playsInline = true;
  camVideo.srcObject = camStream;
  await camVideo.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = SQUARE_SIZE;
  canvas.height = SQUARE_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingQuality = "high";
  let facingBack = false;
  const drawFrame = () => {
    const w = camVideo.videoWidth || SQUARE_SIZE;
    const h = camVideo.videoHeight || SQUARE_SIZE;
    const side = Math.min(w, h);
    ctx.setTransform(facingBack ? 1 : -1, 0, 0, 1, facingBack ? 0 : SQUARE_SIZE, 0);
    ctx.drawImage(camVideo, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SQUARE_SIZE, SQUARE_SIZE);
  };
  await firstFrame(camVideo);
  drawFrame();

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

  async function flipCamera(): Promise<{ ok?: true; error?: string }> {
    switching = true;
    const { track, error } = await getFlippedTrack({
      currentTrack: camStream.getVideoTracks()[0] ?? null,
      wantBack: !facingBack,
      video: { width: CAMERA_VIDEO.width, height: CAMERA_VIDEO.height, frameRate: CAMERA_VIDEO.frameRate },
    });
    if (!track) {
      switching = false;
      return { error };
    }
    // Новую камеру подменяем после её первого кадра — до этого в кружке последний кадр старой.
    const oldTracks = camStream.getVideoTracks();
    const nextStream = new MediaStream([track, ...camStream.getAudioTracks()]);
    const nextVideo = document.createElement("video");
    nextVideo.muted = true;
    nextVideo.playsInline = true;
    nextVideo.srcObject = nextStream;
    await nextVideo.play().catch(() => {});
    const gotFrame = await firstFrame(nextVideo);
    if (!drawing) {
      track.stop();
      nextVideo.srcObject = null;
      return { error: "Запись уже остановлена" };
    }
    // Новая камера кадра не дала — в кружке был бы чёрный экран; пишем дальше со старой.
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
    oldTracks.forEach((t) => t.stop());
    oldVideo.pause();
    oldVideo.srcObject = null;
    facingBack = !facingBack;
    return { ok: true };
  }

  const rec = wireRecorder(
    finalStream,
    pickMime("video"),
    bitrates,
    () => {
      drawing = false;
      camStream.getTracks().forEach((t) => t.stop());
      camVideo.pause();
      camVideo.srcObject = null;
    },
    maxSec
  );
  return { stream: finalStream, previewStream: new MediaStream(canvasStream.getVideoTracks()), ...rec, flipCamera };
}

export async function startRecording(mode: RecordMode): Promise<Recording> {
  if (mode === "voice") {
    const stream = await getMic();
    return { stream, ...wireRecorder(stream, pickMime("audio"), VOICE_BITRATES) };
  }
  return startSquareVideo(SQUARE_CAPTURE_MODES[mode]);
}

/** Громкость микрофона 0..1 для осциллограммы во время записи. */
export function createLevelMeter(stream: MediaStream) {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
      return Math.pow(Math.min(1, sum / buf.length / 22), 0.62);
    },
    /** Можно звать сколько угодно раз: закрывается однажды. */
    close() {
      if (ctx.state === "closed") return;
      source.disconnect();
      ctx.close().catch(() => {});
    },
  };
}
