// Адаптивное качество видео: на телефонах 720p30 (чтобы не лагало и не было задержек),
// на ПК — 1080p60 (чёткое и плавное). degradationPreference: balanced — кодек сам
// снижает чёткость/кадры при слабой сети или процессоре.
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const HD_VIDEO = isMobile
  ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
  : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } };

// Микрофон для звонков: шуно- и эхоподавление. На телефонах моно (меньше нагрузки),
// на ПК — стерео для чистого, «красивого» звука.
export const CALL_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: isMobile ? 1 : 2,
};

// Opus: высокий битрейт для чистого звука, защита от потерь (FEC) и DTX.
export function tuneOpusSdp(desc) {
  if (!desc?.sdp) return desc;
  const pt = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1];
  if (!pt) return desc;
  const params = `useinbandfec=1;usedtx=1;maxaveragebitrate=${isMobile ? 64000 : 128000};stereo=${isMobile ? 0 : 1};sprop-stereo=${isMobile ? 0 : 1}`;
  let sdp = desc.sdp;
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\r\n]*)`);
  if (fmtpRe.test(sdp)) {
    sdp = sdp.replace(fmtpRe, (_, cur) => {
      const kept = cur.split(";").filter((kv) => !/^(useinbandfec|usedtx|maxaveragebitrate|stereo|sprop-stereo)=/.test(kv.trim()));
      return `a=fmtp:${pt} ${[...kept, params].filter(Boolean).join(";")}`;
    });
  } else {
    sdp = sdp.replace(new RegExp(`(a=rtpmap:${pt} opus\/48000[^\r\n]*)`), `$1\r\na=fmtp:${pt} ${params}`);
  }
  return { type: desc.type, sdp };
}

export const HD_SCREEN = {
  video: { ...HD_VIDEO, cursor: "motion" },
  audio: true,
  systemAudio: "include",
};

export function cameraConstraints(extra = {}) {
  return { ...HD_VIDEO, ...extra };
}

export async function tuneVideoSender(sender, { screen = false } = {}) {
  if (!sender || sender.track?.kind !== "video" || typeof sender.getParameters !== "function") return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = screen ? 4_000_000 : isMobile ? 1_500_000 : 3_500_000;
    params.encodings[0].maxFramerate = screen ? 30 : isMobile ? 30 : 60;
    params.degradationPreference = screen ? "maintain-resolution" : "balanced";
    await sender.setParameters(params);
  } catch {
  }
}

export function tunePeerVideo(pc, opts = {}) {
  if (!pc || typeof pc.getSenders !== "function") return;
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind === "video") tuneVideoSender(sender, opts);
  }
}

export function hintScreenTrack(track) {
  if (track && "contentHint" in track) track.contentHint = "detail";
}

// Попытка получить медиа с высоким качеством, с автоматическим fallback на низкое
// если браузер не поддерживает запрошенные параметры (часто на телефонах).
export async function getUserMediaSafe(constraints) {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (firstErr) {
    const fallback = {
      audio: constraints.audio,
      video: constraints.video && {
        width: constraints.video.width ? { ideal: 1280, max: 1280 } : false,
        height: constraints.video.height ? { ideal: 720, max: 720 } : false,
        frameRate: constraints.video.frameRate ? { ideal: 30, max: 30 } : false,
        ...(constraints.video.facingMode ? { facingMode: constraints.video.facingMode } : {}),
      },
    };
    try {
      return await navigator.mediaDevices.getUserMedia(fallback);
    } catch (secondErr) {
      if (constraints.video) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            audio: constraints.audio,
            video: { facingMode: constraints.video.facingMode },
          });
        } catch {}
      }
      throw secondErr ?? firstErr;
    }
  }
}
