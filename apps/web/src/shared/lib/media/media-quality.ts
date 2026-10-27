// Качество звонков. Раньше (public/js/lib/mediaQuality.js в main2) ПК просил 1080p/60,
// 3,5 Мбит/с и стерео Opus 128 кбит/с — на деле это и давало «ужасное качество»: кодировать
// 1080p/60 тяжело (браузер при перегрузке процессора сам режет разрешение до квадратов),
// через TURN и слабый Wi-Fi столько не пролезает (оценка полосы стартует с сотен кбит/с —
// кадр рассыпается и замирает), а стерео с эхоподавлением и DTX портит голос. Поэтому, как
// в Meet/Telegram: камера 720p/30 (на телефоне тоже — аппаратный кодер тянет), потолок
// видео 2,5 Мбит/с на ПК и 1,2 Мбит/с на телефоне, degradationPreference «balanced»;
// голос — моно Opus с FEC, без DTX.

export const isMobileUa = (ua: string) => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
const IS_MOBILE = typeof navigator !== "undefined" && isMobileUa(navigator.userAgent);

/** Параметры качества для телефона или ПК. */
export function mediaQuality(mobile: boolean) {
  return {
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } satisfies MediaTrackConstraints,
    // Голос: моно с шумо- и эхоподавлением (стерео-захват на ПК ломал эхоподавление).
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } satisfies MediaTrackConstraints,
    opusBitrate: mobile ? 48_000 : 64_000,
    videoBitrate: mobile ? 1_200_000 : 2_500_000,
    videoFramerate: 30,
  };
}

export type MediaQuality = ReturnType<typeof mediaQuality>;

const QUALITY = mediaQuality(IS_MOBILE);

export const HD_VIDEO: MediaTrackConstraints = QUALITY.video;
export const CALL_AUDIO: MediaTrackConstraints = QUALITY.audio;

// Экран — до 1080p (мелкий текст), 30 кадров; cursor и systemAudio знают не все браузеры (и не все типы DOM).
export const HD_SCREEN = {
  video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 }, cursor: "motion" },
  audio: true,
  systemAudio: "include",
} as DisplayMediaStreamOptions;

/** Потолок показа экрана: чёткость важнее кадров. */
export const SCREEN_BITRATE = 3_000_000;

export const cameraConstraints = (extra: MediaTrackConstraints = {}): MediaTrackConstraints => ({ ...HD_VIDEO, ...extra });

const OPUS_KEYS = /^(useinbandfec|usedtx|maxaveragebitrate|stereo|sprop-stereo)=/;

// Opus — это то, что мы готовы принимать: моно, защита от потерь (FEC), битрейт речи.
// DTX выключен: с шумоподавлением он «съедает» начала слов и даёт рваный звук.
export function tuneOpusSdp(desc: RTCSessionDescriptionInit, quality: MediaQuality = QUALITY): RTCSessionDescriptionInit {
  if (!desc?.sdp) return desc;
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(desc.sdp)?.[1];
  if (!pt) return desc;
  const params = `useinbandfec=1;maxaveragebitrate=${quality.opusBitrate};stereo=0;sprop-stereo=0`;
  let sdp = desc.sdp;
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\r\n]*)`);
  if (fmtpRe.test(sdp)) {
    sdp = sdp.replace(fmtpRe, (_, cur: string) => {
      const kept = cur.split(";").filter((kv) => kv.trim() && !OPUS_KEYS.test(kv.trim()));
      return `a=fmtp:${pt} ${[...kept, params].join(";")}`;
    });
  } else {
    sdp = sdp.replace(new RegExp(`(a=rtpmap:${pt} opus/48000[^\r\n]*)`), `$1\r\na=fmtp:${pt} ${params}`);
  }
  return { type: desc.type, sdp };
}

type SendParams = RTCRtpSendParameters & { degradationPreference?: string };

/**
 * Потолок битрейта и кадров видеоотправителя. Кодировки появляются только после
 * согласования (до него encodings пуст, а дописать свою нельзя — setParameters падает),
 * поэтому звонок вызывает это и после setLocalDescription, и когда соединились.
 * Возвращает true, если браузер принял настройки.
 */
export async function tuneVideoSender(sender: RTCRtpSender | null, { screen = false, quality = QUALITY }: { screen?: boolean; quality?: MediaQuality } = {}): Promise<boolean> {
  if (!sender || sender.track?.kind !== "video" || typeof sender.getParameters !== "function") return false;
  const apply = async (withPreference: boolean) => {
    // setParameters принимает только свежий результат getParameters (transactionId).
    const params = sender.getParameters() as SendParams;
    const enc = params.encodings?.[0];
    if (!enc) return false;
    enc.maxBitrate = screen ? SCREEN_BITRATE : quality.videoBitrate;
    enc.maxFramerate = screen ? 30 : quality.videoFramerate;
    // Камера: balanced — при слабой сети плавно снижает и чёткость, и кадры;
    // экран: держит разрешение (текст), теряет кадры.
    if (withPreference) params.degradationPreference = screen ? "maintain-resolution" : "balanced";
    await sender.setParameters(params);
    return true;
  };
  try {
    return await apply(true);
  } catch {
    // degradationPreference знают не все браузеры — хотя бы битрейт.
    try {
      return await apply(false);
    } catch {
      return false;
    }
  }
}

/** Подсказка кодеру: камера — движение (плавность), экран — детали (чёткий текст). */
export function hintVideoTrack(track: MediaStreamTrack | null | undefined, hint: "motion" | "detail") {
  if (track && "contentHint" in track) track.contentHint = hint;
}

export const hintScreenTrack = (track: MediaStreamTrack) => hintVideoTrack(track, "detail");

const permissionDenied = (err: unknown) => /NotAllowed|Security|Permission/i.test((err as Error)?.name ?? "");

/**
 * getUserMedia с запасными вариантами, как getUserMediaSafe в public/js/lib/mediaQuality.js:
 * камера не дала 720p/30 (OverconstrainedError, занята и т.п.) — просим 640×480/30, не вышло
 * и это — камеру без требований к качеству (только выбор камеры). Запрет доступа не повторяем.
 */
export async function getUserMediaSafe(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const gum = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);
  try {
    return await gum(constraints);
  } catch (firstErr) {
    const video = constraints.video;
    if (!video || permissionDenied(firstErr)) throw firstErr;
    const { width, height, frameRate, ...pick } = video === true ? ({} as MediaTrackConstraints) : video;
    const camera: MediaTrackConstraints = {};
    if (pick.deviceId !== undefined) camera.deviceId = pick.deviceId;
    if (pick.facingMode !== undefined) camera.facingMode = pick.facingMode;
    const sd: MediaTrackConstraints = {
      ...(width ? { width: { ideal: 640 } } : {}),
      ...(height ? { height: { ideal: 480 } } : {}),
      ...(frameRate ? { frameRate: { ideal: 30, max: 30 } } : {}),
      ...camera,
    };
    let lastErr: unknown = firstErr;
    const steps = JSON.stringify(sd) === JSON.stringify(camera) ? [camera] : [sd, camera];
    for (const v of steps) {
      try {
        return await gum({ audio: constraints.audio, video: Object.keys(v).length ? v : true });
      } catch (err) {
        lastErr = err;
        if (permissionDenied(err)) break;
      }
    }
    throw lastErr;
  }
}
