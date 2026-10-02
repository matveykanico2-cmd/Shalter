const TARGET_LONG_SIDE = 848;
const TARGET_VIDEO_BPS = 1_400_000;
const TARGET_AUDIO_BPS = 96_000;
const MAX_DURATION_SEC = 240;
const SKIP_IF_UNDER_BPS = 1_800_000;

function captureStream(elOrCanvas, fps) {
  if (elOrCanvas.captureStream) return fps ? elOrCanvas.captureStream(fps) : elOrCanvas.captureStream();
  if (elOrCanvas.mozCaptureStream) return fps ? elOrCanvas.mozCaptureStream(fps) : elOrCanvas.mozCaptureStream();
  return null;
}

export async function compressVideoFile(file, onProgress) {
  if (typeof MediaRecorder === "undefined") return file;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("meta"));
    });

    const w0 = video.videoWidth;
    const h0 = video.videoHeight;
    const dur = video.duration;
    if (!w0 || !h0 || !Number.isFinite(dur) || dur <= 0) return file;
    if (dur > MAX_DURATION_SEC) return file;
    const sourceBps = (file.size * 8) / dur;
    const alreadySmall = Math.max(w0, h0) <= TARGET_LONG_SIDE && sourceBps < SKIP_IF_UNDER_BPS;
    if (alreadySmall) return file;

    const scale = Math.min(1, TARGET_LONG_SIDE / Math.max(w0, h0));
    const w = Math.round((w0 * scale) / 2) * 2;
    const h = Math.round((h0 * scale) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const canvasStream = captureStream(canvas, 30);
    if (!canvasStream) return file;
    const mediaStream = captureStream(video);
    const audioTracks = mediaStream ? mediaStream.getAudioTracks() : [];
    const outStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t)
    );
    if (!mime) return file;
    const recorder = new MediaRecorder(outStream, {
      mimeType: mime,
      videoBitsPerSecond: TARGET_VIDEO_BPS,
      audioBitsPerSecond: TARGET_AUDIO_BPS,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const done = new Promise((resolve) => (recorder.onstop = resolve));
    let drawing = true;
    (function draw() {
      if (!drawing) return;
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h);
      if (onProgress && dur) onProgress(Math.min(1, video.currentTime / dur));
      requestAnimationFrame(draw);
    })();

    recorder.start();
    await video.play();
    await new Promise((resolve) => {
      video.onended = resolve;
    });
    drawing = false;
    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: "video/webm" });
    if (!blob.size || blob.size >= file.size) return file;
    const name = (file.name || "video").replace(/\.[^.]+$/, "") + ".webm";
    return new File([blob], name, { type: "video/webm" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
  }
}
