// Speech-to-text for voice messages/video notes, entirely client-side — no
// server cost, no API key. Runs Whisper (tiny) via transformers.js, loaded
// straight from esm.sh same as codeEditor.js's CodeMirror (see that file's
// comment for why this project pulls real npm packages from a CDN rather
// than vendoring/bundling them).
//
// Pinned to @xenova/transformers@2.17.2 deliberately, not left on a floating
// major version — confirmed live (not just from docs): the current
// @huggingface/transformers@4.x (the package's newer name/major) pairs with
// a "-dev" onnxruntime-web build on esm.sh that fails loading whisper-tiny's
// quantized weights ("Missing required scale: ...weight_merged_0_scale").
// 2.17.2 is the last release under the old @xenova/transformers name — the
// version the overwhelming majority of existing browser-Whisper demos still
// use — and its onnxruntime-web pairing loads and runs cleanly.
import { pipeline, env } from "https://esm.sh/@xenova/transformers@2.17.2";

// Confirmed live: without this, transformers.js's default "try a local
// model first" behavior checks `${origin}/models/Xenova/whisper-tiny/...` —
// and on *this* app specifically that local check always looks like it
// succeeds, because server/index.js's client-side-router catch-all serves
// index.html (200 OK) for literally any unmatched path. transformers.js then
// tries to parse that HTML as the model's config.json and fails with a
// "Unexpected token '<' ... is not valid JSON" error, never reaching the
// real fallback to Hugging Face's own CDN. Forcing remote-only sidesteps the
// local check entirely instead of relying on it happening to 404.
env.allowLocalModels = false;

const MODEL = "Xenova/whisper-tiny";

let transcriberPromise = null;
function getTranscriber(onProgress) {
  if (!transcriberPromise) {
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL, {
      progress_callback: onProgress,
    }).catch((err) => {
      transcriberPromise = null; // let a later call retry instead of caching the failure forever
      throw err;
    });
  }
  return transcriberPromise;
}

// Whisper expects mono 16kHz PCM — a recorded voice message/video note is
// whatever the MediaRecorder produced (typically 44.1/48kHz, and video-notes
// carry a video track too), so this decodes then re-renders through an
// OfflineAudioContext pinned to 1 channel / 16000Hz to get exactly that,
// rather than feeding Whisper audio it wasn't trained to expect.
async function decodeToMono16k(url) {
  const bytes = await fetch(url).then((r) => r.arrayBuffer());
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(bytes);
  } finally {
    decodeCtx.close();
  }
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

// url: a voice/video-note attachment's own url (data: or http(s):, same as
// what <audio>/<video> already play from). onProgress, if given, is called
// with transformers.js's raw progress events during the one-time model
// download (only on the very first call in a page session — cached after).
export async function transcribeAudio(url, onProgress) {
  const [transcriber, audio] = await Promise.all([getTranscriber(onProgress), decodeToMono16k(url)]);
  const result = await transcriber(audio);
  return (result.text ?? "").trim();
}

// Keyed by message id, survives a message bubble being torn down and
// recreated mid-transcription — this app has no vdom (see AGENTS.md), and
// chatView.js polls+fully-re-renders the message list every 15s. The very
// first transcription in a page session downloads the ~40MB model, which can
// easily take longer than that; without this cache that poll would wipe the
// in-progress "Расшифровываем…" state (and, worse, the finished result,
// since the promise itself was only ever wired to the now-discarded bubble
// instance's DOM node) with no way to recover it short of clicking again.
export const transcriptCache = new Map();
