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

// mode: "voice" | "video-note". onTick(sec) fires once a second while recording.
// Returns a handle: { stream, stop(), cancel(), result } where `result` is a
// promise that resolves to {url, mimeType, durationSec} — only if stop() (not
// cancel()) ends the recording.
export async function startRecording(mode, { onTick } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia(
    mode === "voice" ? { audio: true } : { audio: true, video: { width: 240, height: 240 } }
  );
  const mimeType = mode === "voice" ? "audio/webm" : "video/webm";
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
      if (cancelled) return resolve(null);
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      const url = await blobToDataUrl(blob);
      resolve({ url, mimeType: blob.type, durationSec: sec });
    };
  });

  recorder.start();
  autoStopTimer = setTimeout(() => recorder.stop(), MAX_RECORD_SEC * 1000);

  return {
    stream,
    stop: () => recorder.stop(),
    cancel: () => {
      cancelled = true;
      recorder.stop();
    },
    result,
  };
}
