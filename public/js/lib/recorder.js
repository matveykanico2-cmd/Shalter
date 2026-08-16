import { getFlippedTrack } from "./cameraSwitch.js";
// Extracted MediaRecorder logic (voice messages + round video-notes/"kruzhki")
// from the original Composer.tsx — recorded clips are kept as inline base64
// data URLs (no object storage), capped at MAX_RECORD_SEC to keep messages.json rows small.
export const MAX_RECORD_SEC = 20;

export function isRecordingSupported() {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Wires up the MediaRecorder timers/result-promise plumbing shared by both
// recording modes. `extraStop` runs alongside stopping `stream`'s own tracks
// (video-notes need it to also release the camera feeding the canvas).
function wireRecorder(stream, mimeType, onTick, extraStop) {
  const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined);
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
      // Data URLs split header from payload at the FIRST comma (RFC 2397),
      // and MediaRecorder's real mimeType can be a comma-separated codecs
      // list (e.g. "video/webm;codecs=vp8,opus") — embedding that raw
      // corrupts the resulting data: URL. The container already carries its
      // own codec info, so the outer Blob/data-URL only needs the base type.
      const baseType = (recorder.mimeType || mimeType).split(";")[0];
      const blob = new Blob(chunks, { type: baseType });
      const url = await blobToDataUrl(blob);
      resolve({ url, mimeType: blob.type, durationSec: sec });
    };
  });

  recorder.start();
  autoStopTimer = setTimeout(() => recorder.stop(), MAX_RECORD_SEC * 1000);

  return {
    stop: () => recorder.stop(),
    cancel: () => {
      cancelled = true;
      recorder.stop();
    },
    // Пауза: MediaRecorder умеет её сам, наружу это просто не было выведено.
    // Таймер тоже останавливается — иначе счётчик считает то, чего в записи нет.
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
      // Остаток от общего лимита, а не полный лимит заново.
      autoStopTimer = setTimeout(() => recorder.stop(), Math.max(1000, (MAX_RECORD_SEC - sec) * 1000));
      return true;
    },
    isPaused: () => recorder.state === "paused",
    result,
  };
}

// Уровень звука с микрофона — для живой волны в интерфейсе. Без него полоска
// рисуется случайными палочками, а это видно сразу: она не совпадает с тем,
// что человек говорит.
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
    // 0..1 — громкость в том виде, в каком её рисуют.
    //
    // Делитель и степень подобраны не на глаз: обычная речь даёт отклонение
    // около 8–15 единиц из 128, и при простом делении на 40 полоски выходили
    // ростом в десятую часть строки — волна выглядела плоской ниточкой.
    // Корень поднимает тихое, не давая громкому упереться в потолок.
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
        // Контекст мог закрыться сам вместе с остановкой дорожки.
      }
    },
  };
}

async function startVoiceRecording(onTick) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = wireRecorder(stream, "audio/webm", onTick);
  return { stream, ...rec };
}

// video-note ("kruzhok") recording draws the live camera onto an off-DOM
// canvas and records canvas.captureStream() rather than the raw camera
// stream. MediaRecorder throws InvalidModificationError (and stops dead) if
// a track is added to or removed from the stream it's actively recording —
// confirmed by testing the naive "swap the video track in place" approach,
// which killed the recording the instant the camera flipped. The canvas
// gives MediaRecorder a video track whose identity never changes; only the
// camera feeding pixels into the canvas changes underneath it.
async function startVideoNoteRecording(onTick) {
  let camStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: 240, height: 240, facingMode: "user" },
  });

  const camVideo = document.createElement("video");
  camVideo.muted = true;
  camVideo.playsInline = true;
  camVideo.srcObject = camStream;
  await camVideo.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");

  // canvas.captureStream() grabs whatever's already painted at the instant
  // it's called — starting the capture before the draw loop's first
  // requestAnimationFrame callback has run hands MediaRecorder a blank
  // opening frame, which corrupted the whole container (recording completed
  // and produced a normal-sized file, but every output failed to demux on
  // playback). Paint one real frame first, synchronously, before capturing.
  await new Promise((resolve) => {
    (function waitForFirstFrame() {
      if (camVideo.readyState >= 2) {
        ctx.drawImage(camVideo, 0, 0, canvas.width, canvas.height);
        resolve();
      } else {
        requestAnimationFrame(waitForFirstFrame);
      }
    })();
  });

  let drawing = true;
  (function draw() {
    if (!drawing) return;
    if (camVideo.readyState >= 2) ctx.drawImage(camVideo, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
  })();

  const canvasStream = canvas.captureStream(30);
  // The audio track is recorded straight from the mic and is never swapped,
  // so it's safe to hand the same live track to the final stream.
  const finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...camStream.getAudioTracks()]);

  let facingBack = false;
  // Переключение камеры — общей механикой из lib/cameraSwitch.js, той же, что в
  // звонке. Раньше здесь стоял свой упрощённый вариант с теми же изъянами:
  // мягкий facingMode (браузер вправе вернуть ту же камеру) и пустой catch,
  // из-за которого кнопка молчала при любой неудаче.
  async function flipCamera() {
    const currentTrack = camStream.getVideoTracks()[0] ?? null;
    const { track, error } = await getFlippedTrack({
      currentTrack,
      wantBack: !facingBack,
      video: { width: 240, height: 240 },
    });
    if (!track) return { error };

    // Звук берётся из прежнего потока: перезапрашивать микрофон посреди записи
    // значит потерять уже записанное.
    camStream.getVideoTracks().forEach((t) => t.stop());
    camStream = new MediaStream([track, ...camStream.getAudioTracks()]);
    camVideo.srcObject = camStream;
    await camVideo.play().catch(() => {});
    facingBack = !facingBack;
    return { ok: true };
  }

  const rec = wireRecorder(finalStream, "video/webm", onTick, () => {
    drawing = false;
    camStream.getTracks().forEach((t) => t.stop());
    camVideo.pause();
    camVideo.srcObject = null;
  });

  return { stream: finalStream, ...rec, flipCamera };
}

// mode: "voice" | "video-note". onTick(sec) fires once a second while recording.
// Returns a handle: { stream, stop(), cancel(), result, flipCamera? } where
// `result` is a promise that resolves to {url, mimeType, durationSec} — only
// if stop() (not cancel()) ends the recording. flipCamera is only present
// for "video-note".
export async function startRecording(mode, { onTick } = {}) {
  return mode === "voice" ? startVoiceRecording(onTick) : startVideoNoteRecording(onTick);
}
