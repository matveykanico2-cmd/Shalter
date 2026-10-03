// 720p при 30 кадрах — чётко и не грузит процессор (60 кадров кодировать вдвое тяжелее,
// а большинство веб-камер всё равно отдают 30).
export const HD_VIDEO = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

// Микрофон для звонков: шумо- и эхоподавление, моно.
export const CALL_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

// Opus: 64 кбит/с, защита от потерь (FEC) и DTX — в паузах почти ничего не передаётся.
export function tuneOpusSdp(desc) {
  if (!desc?.sdp) return desc;
  const pt = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1];
  if (!pt) return desc;
  const params = "useinbandfec=1;usedtx=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0";
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
    params.encodings[0].maxBitrate = screen ? 4_000_000 : 2_500_000;
    params.encodings[0].maxFramerate = screen ? 30 : 30;
    // balanced: при слабой сети/процессоре плавно снижает и чёткость, и частоту кадров
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
