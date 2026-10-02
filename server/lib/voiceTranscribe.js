// Server-side speech-to-text for voice messages and video notes whose sender's
// browser couldn't transcribe them (Electron and many Chromium builds have no
// working Web Speech service). Converts the recording to small mono MP3 and sends
// it to an OpenAI-compatible chat endpoint that accepts `input_audio`.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { ffmpegPath } = require("./ffmpegBinary");
const ffmpeg = require("fluent-ffmpeg");
const { VOICE_STT_ENABLED, VOICE_STT_URL, VOICE_STT_MODEL, VOICE_STT_KEY } = require("../config");

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
console.log(VOICE_STT_ENABLED ? `[stt] расшифровка голосовых включена (${VOICE_STT_MODEL})` : "[stt] расшифровка голосовых выключена — задайте VOICE_STT_KEY");

const MAX_DURATION_SEC = 5 * 60;
const TIMEOUT_MS = 60000;

function tempPath(ext) {
  return path.join(os.tmpdir(), `shalter_stt_${crypto.randomBytes(8).toString("hex")}${ext}`);
}

function toMp3(inputPath) {
  const out = tempPath(".mp3");
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate("32k")
      .duration(MAX_DURATION_SEC)
      .output(out)
      .on("end", () => resolve(out))
      .on("error", (err) => {
        fs.promises.unlink(out).catch(() => {});
        reject(err);
      })
      .run();
  });
}

// Returns the transcript text, or "" when nothing intelligible was said.
async function transcribeFile(inputPath) {
  const mp3 = await toMp3(inputPath);
  try {
    const data = (await fs.promises.readFile(mp3)).toString("base64");
    const res = await fetch(VOICE_STT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(VOICE_STT_KEY ? { Authorization: `Bearer ${VOICE_STT_KEY}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: VOICE_STT_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe this audio verbatim in its original language. Reply with the transcript only, no comments. If there is no speech, reply with an empty string.",
              },
              { type: "input_audio", input_audio: { data, format: "mp3" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    return /^["'«»]*$/.test(text) ? "" : text.slice(0, 4000);
  } finally {
    await fs.promises.unlink(mp3).catch(() => {});
  }
}

function needsTranscript(attachment) {
  return (
    VOICE_STT_ENABLED &&
    (attachment?.kind === "voice" || attachment?.kind === "video-note") &&
    !attachment.transcript &&
    !(attachment.durationSec > MAX_DURATION_SEC)
  );
}

module.exports = { transcribeFile, needsTranscript };
