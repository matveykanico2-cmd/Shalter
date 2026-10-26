// Качество звонков — как public/js/lib/mediaQuality.js: камера 720p/30, микрофон с
// шумоподавлением, Opus с защитой от потерь, битрейт видео и показа экрана.

// 720p при 30 кадрах — чётко и не грузит процессор (60 кадров кодировать вдвое тяжелее,
// а большинство веб-камер всё равно отдают 30).
export const HD_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

// Микрофон для звонков: шумо- и эхоподавление, моно.
export const CALL_AUDIO: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

// cursor и systemAudio знают не все браузеры (и не все типы DOM).
export const HD_SCREEN = {
  video: { ...HD_VIDEO, cursor: "motion" },
  audio: true,
  systemAudio: "include",
} as DisplayMediaStreamOptions;

export const cameraConstraints = (extra: MediaTrackConstraints = {}): MediaTrackConstraints => ({ ...HD_VIDEO, ...extra });

// Opus: 64 кбит/с, защита от потерь (FEC) и DTX — в паузах почти ничего не передаётся.
export function tuneOpusSdp(desc: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  if (!desc?.sdp) return desc;
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(desc.sdp)?.[1];
  if (!pt) return desc;
  const params = "useinbandfec=1;usedtx=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0";
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

export async function tuneVideoSender(sender: RTCRtpSender | null, { screen = false } = {}) {
  if (!sender || sender.track?.kind !== "video" || typeof sender.getParameters !== "function") return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0]!.maxBitrate = screen ? 4_000_000 : 2_500_000;
    params.encodings[0]!.maxFramerate = 30;
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
