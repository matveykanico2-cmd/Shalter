// Качество звонков — как public/js/lib/mediaQuality.js: на телефонах камера 720p/30 и моно
// (чтобы не лагало), на ПК 1080p/60 и стерео; шумоподавление, Opus с защитой от потерь,
// битрейт видео и показа экрана. degradationPreference: balanced — кодек сам снижает
// чёткость и кадры при слабой сети или процессоре.

export const isMobileUa = (ua: string) => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
const IS_MOBILE = typeof navigator !== "undefined" && isMobileUa(navigator.userAgent);

/** Параметры качества для телефона или ПК. */
export function mediaQuality(mobile: boolean) {
  return {
    video: (mobile
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
      : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } }) satisfies MediaTrackConstraints,
    // Микрофон: шумо- и эхоподавление; на телефонах моно (меньше нагрузки), на ПК стерео.
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: mobile ? 1 : 2 } satisfies MediaTrackConstraints,
    opusBitrate: mobile ? 64_000 : 128_000,
    stereo: !mobile,
    videoBitrate: mobile ? 1_500_000 : 3_500_000,
    videoFramerate: mobile ? 30 : 60,
  };
}

const QUALITY = mediaQuality(IS_MOBILE);

export const HD_VIDEO: MediaTrackConstraints = QUALITY.video;
export const CALL_AUDIO: MediaTrackConstraints = QUALITY.audio;

// cursor и systemAudio знают не все браузеры (и не все типы DOM).
export const HD_SCREEN = {
  video: { ...HD_VIDEO, cursor: "motion" },
  audio: true,
  systemAudio: "include",
} as DisplayMediaStreamOptions;

export const cameraConstraints = (extra: MediaTrackConstraints = {}): MediaTrackConstraints => ({ ...HD_VIDEO, ...extra });

// Opus: 64 кбит/с моно на телефоне, 128 кбит/с стерео на ПК; защита от потерь (FEC) и DTX —
// в паузах почти ничего не передаётся.
export function tuneOpusSdp(desc: RTCSessionDescriptionInit, quality = QUALITY): RTCSessionDescriptionInit {
  if (!desc?.sdp) return desc;
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(desc.sdp)?.[1];
  if (!pt) return desc;
  const stereo = quality.stereo ? 1 : 0;
  const params = `useinbandfec=1;usedtx=1;maxaveragebitrate=${quality.opusBitrate};stereo=${stereo};sprop-stereo=${stereo}`;
  let sdp = desc.sdp;
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\r\n]*)`);
  if (fmtpRe.test(sdp)) {
    sdp = sdp.replace(fmtpRe, (_, cur: string) => {
      const kept = cur.split(";").filter((kv) => !/^(useinbandfec|usedtx|maxaveragebitrate|stereo|sprop-stereo)=/.test(kv.trim()));
      return `a=fmtp:${pt} ${[...kept, params].filter(Boolean).join(";")}`;
    });
  } else {
    sdp = sdp.replace(new RegExp(`(a=rtpmap:${pt} opus/48000[^\r\n]*)`), `$1\r\na=fmtp:${pt} ${params}`);
  }
  return { type: desc.type, sdp };
}

export async function tuneVideoSender(sender: RTCRtpSender | null, { screen = false, quality = QUALITY } = {}) {
  if (!sender || sender.track?.kind !== "video" || typeof sender.getParameters !== "function") return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0]!.maxBitrate = screen ? 4_000_000 : quality.videoBitrate;
    params.encodings[0]!.maxFramerate = screen ? 30 : quality.videoFramerate;
    // balanced: при слабой сети/процессоре плавно снижает и чёткость, и частоту кадров
    (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = screen ? "maintain-resolution" : "balanced";
    await sender.setParameters(params);
  } catch {
    // Браузер не дал настроить — шлёт как умеет.
  }
}

export function hintScreenTrack(track: MediaStreamTrack) {
  if ("contentHint" in track) track.contentHint = "detail";
}

const permissionDenied = (err: unknown) => /NotAllowed|Security|Permission/i.test((err as Error)?.name ?? "");

/**
 * getUserMedia с запасными вариантами, как getUserMediaSafe в public/js/lib/mediaQuality.js:
 * телефон не дал 1080p/60 (OverconstrainedError и т.п.) — просим 720p/30, не вышло и это —
 * камеру без требований к качеству (только выбор камеры). Запрет доступа не повторяем.
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
    const hd: MediaTrackConstraints = {
      ...(width ? { width: { ideal: 1280, max: 1280 } } : {}),
      ...(height ? { height: { ideal: 720, max: 720 } } : {}),
      ...(frameRate ? { frameRate: { ideal: 30, max: 30 } } : {}),
      ...camera,
    };
    let lastErr: unknown = firstErr;
    const steps = JSON.stringify(hd) === JSON.stringify(camera) ? [camera] : [hd, camera];
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
