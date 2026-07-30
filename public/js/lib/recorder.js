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
  const tickTimer = setInterval(() => {
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
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
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
    result,
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
  async function flipCamera() {
    const nextFacing = !facingBack;
    try {
      const newCamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 240, height: 240, facingMode: nextFacing ? "environment" : "user" },
      });
      camStream.getVideoTracks().forEach((t) => t.stop());
      camStream = newCamStream;
      camVideo.srcObject = newCamStream;
      await camVideo.play().catch(() => {});
      facingBack = nextFacing;
    } catch {
      // Camera unavailable/unsupported facing mode — keep current track.
    }
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
