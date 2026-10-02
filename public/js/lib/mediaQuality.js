export const HD_VIDEO = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 60 },
};

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
    params.encodings[0].maxBitrate = screen ? 5_000_000 : 3_500_000;
    params.encodings[0].maxFramerate = 60;
    params.degradationPreference = screen ? "maintain-resolution" : "maintain-framerate";
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
