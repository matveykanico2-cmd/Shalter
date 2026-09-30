import { getFlippedTrack } from "./cameraSwitch.js";
// Extracted MediaRecorder logic (voice messages + round video-notes/"kruzhki")
// from the original Composer.tsx.
//
// Запись отдаётся куском данных (Blob), а не base64-строкой внутри сообщения.
// Так было раньше, и это стоило дорого: base64 больше исходника на треть, и вся
// эта строка ехала внутри JSON самого сообщения — то есть сообщение не
// появлялось у человека, пока не уедет целиком. Двухминутный кружок таким
// способом отправить нельзя вовсе. Теперь запись уходит обычной загрузкой
// файла (lib/upload.js), которая умеет показывать ход и не держит всё в памяти.
export const MAX_RECORD_SEC = 180;

// Кружок и голосовое пишутся сразу на пониженном битрейте, а не режутся потом.
// Три минуты видео с телефонным битрейтом по умолчанию (несколько Мбит/с) —
// это десятки мегабайт на одно сообщение; 240p-кружку столько не нужно.
// ~700 кбит/с на картинку 240×240 хватает с запасом.
//
// Звук — 96 кбит/с, а не 32, как было. 32 кбит/с ещё терпимо для opus, но
// Safari/iOS пишет не webm/opus, а mp4/AAC, и AAC на 32 кбит/с срезает всё
// выше ~7 кГц: голос звучит глухо, «как из трубы». 96 кбит/с моно — это
// ~2 МБ на три минуты, разница в весе с 32 кбит/с незаметна на фоне видео.
const VIDEO_NOTE_BITRATES = { videoBitsPerSecond: 700_000, audioBitsPerSecond: 96_000 };
const VOICE_BITRATES = { audioBitsPerSecond: 96_000 };

// Микрофон: моно 48 кГц с эхо- и шумоподавлением. При голом `audio: true`
// часть браузеров (Android WebView, десктопный Chrome с гарнитурой) отдаёт
// стерео 16/44.1 кГц без обработки — отсюда эхо комнаты и гулкий звук, а
// стерео ещё и делит и без того малый битрейт пополам.
const MIC_CONSTRAINTS = {
  channelCount: 1,
  sampleRate: 48_000,
  sampleSize: 16,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Предпочтительные контейнеры по порядку: opus явно, чтобы браузер не выбрал
// что-то хуже по умолчанию; mp4 — для Safari, где webm не пишется вовсе.
function pickMime(kind) {
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"]
      : ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm"];
  return list.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}
// Видео-аватар пишется тем же квадратным захватом 240×240, что и кружок, но
// живёт в профиле дольше одного сообщения, поэтому картинке даётся больше
// битрейта; длительность — свой предел (см. components/avatarViewer.js).
const AVATAR_VIDEO_BITRATES = { videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 };
export const MAX_AVATAR_VIDEO_SEC = 180;
const SQUARE_CAPTURE_MODES = {
  "video-note": { bitrates: VIDEO_NOTE_BITRATES, maxSec: MAX_RECORD_SEC },
  "avatar-video": { bitrates: AVATAR_VIDEO_BITRATES, maxSec: MAX_AVATAR_VIDEO_SEC },
};

export function isRecordingSupported() {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

// Wires up the MediaRecorder timers/result-promise plumbing shared by both
// recording modes. `extraStop` runs alongside stopping `stream`'s own tracks
// (video-notes need it to also release the camera feeding the canvas).
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
      // Data URLs split header from payload at the FIRST comma (RFC 2397),
      // and MediaRecorder's real mimeType can be a comma-separated codecs
      // list (e.g. "video/webm;codecs=vp8,opus") — embedding that raw
      // corrupts the resulting data: URL. The container already carries its
      // own codec info, so the outer Blob/data-URL only needs the base type.
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
      autoStopTimer = setTimeout(() => recorder.stop(), Math.max(1000, (maxSec - sec) * 1000));
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

// Старые браузеры отвергают незнакомые ограничения целиком (OverconstrainedError)
// — тогда берём микрофон как есть, лишь бы запись вообще пошла.
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

// Square 240×240 capture, shared by the video-note ("kruzhok") and the video
// avatar. Draws the live camera onto an off-DOM canvas and records
// canvas.captureStream() rather than the raw camera stream. MediaRecorder throws InvalidModificationError (and stops dead) if
// a track is added to or removed from the stream it's actively recording —
// confirmed by testing the naive "swap the video track in place" approach,
// which killed the recording the instant the camera flipped. The canvas
// gives MediaRecorder a video track whose identity never changes; only the
// camera feeding pixels into the canvas changes underneath it.
async function startSquareVideoRecording(onTick, { bitrates, maxSec }) {
  let camStream = await getMic({ width: 240, height: 240, facingMode: "user" });

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

  const rec = wireRecorder(finalStream, pickMime("video"), onTick, () => {
    drawing = false;
    camStream.getTracks().forEach((t) => t.stop());
    camVideo.pause();
    camVideo.srcObject = null;
  }, bitrates, maxSec);

  // Превью кружка показывает только картинку: звук в нём не нужен, а живой
  // аудиотрек в <video> на части телефонов переключает звук в «режим звонка».
  const previewStream = new MediaStream(canvasStream.getVideoTracks());
  return { stream: finalStream, previewStream, ...rec, flipCamera };
}

// mode: "voice" | "video-note" | "avatar-video". onTick(sec) fires once a second
// while recording. Returns a handle: { stream, stop(), cancel(), result,
// flipCamera? } where `result` is a promise that resolves to {blob, mimeType,
// durationSec} — only if stop() (not cancel()) ends the recording. flipCamera is
// only present for the square video modes.
export async function startRecording(mode, { onTick } = {}) {
  if (mode === "voice") return startVoiceRecording(onTick);
  return startSquareVideoRecording(onTick, SQUARE_CAPTURE_MODES[mode] ?? SQUARE_CAPTURE_MODES["video-note"]);
}
