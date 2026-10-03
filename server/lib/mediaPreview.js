const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { ffmpegPath } = require("./ffmpegBinary");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

sharp.cache(false);
sharp.concurrency(1);

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// Копия для просмотра в чате: до 720p — чётко, но легче оригинала.
const PREVIEW_HEIGHT = 720;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

function createQueue(concurrency) {
  let running = 0;
  const waiting = [];
  const next = () => {
    if (running >= concurrency || !waiting.length) return;
    running += 1;
    const { task, resolve, reject } = waiting.shift();
    task().then(resolve, reject).finally(() => {
      running -= 1;
      next();
    });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      next();
    });
}

const videoQueue = createQueue(1);
const imageQueue = createQueue(2);

function tempPath(ext) {
  return path.join(os.tmpdir(), `shalter_preview_${crypto.randomBytes(8).toString("hex")}${ext}`);
}

function parseDuration(value) {
  const parts = String(value ?? "").split(":");
  if (parts.length !== 3) return 0;
  const seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return Number.isFinite(seconds) ? seconds : 0;
}

function parseSize(codecData) {
  for (const detail of codecData?.video_details ?? []) {
    const m = /(\d{2,5})x(\d{2,5})/.exec(String(detail));
    if (m) return { width: Number(m[1]), height: Number(m[2]) };
  }
  return null;
}

function runFfmpeg(build) {
  return new Promise((resolve, reject) => {
    let codecData = null;
    const command = build(ffmpeg());
    const timer = setTimeout(() => {
      command.kill("SIGKILL");
      reject(new Error("превью не уложилось в отведённое время"));
    }, JOB_TIMEOUT_MS);
    timer.unref();
    command
      .on("codecData", (data) => {
        codecData = data;
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .on("end", () => {
        clearTimeout(timer);
        resolve(codecData);
      })
      .run();
  });
}

async function generateVideoPreview(inputPath) {
  return videoQueue(async () => {
    const previewPath = tempPath(".mp4");
    const posterPath = tempPath(".jpg");
    let codecData = null;
    try {
      codecData = await runFfmpeg((cmd) =>
        cmd
          .input(inputPath)
          .videoCodec("libx264")
          .audioCodec("aac")
          .audioBitrate("128k")
          .outputOptions([
            // не растягиваем маленькие видео: высота не больше исходной
            `-vf scale=-2:'min(${PREVIEW_HEIGHT},ih)'`,
            "-preset veryfast",
            "-crf 23",
            "-maxrate 3000k",
            "-bufsize 6000k",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
          ])
          .output(previewPath)
      );

      const durationSec = Math.round(parseDuration(codecData?.duration));
      const posterAt = durationSec > 2 ? 1 : 0;
      await runFfmpeg((cmd) =>
        cmd.input(previewPath).seekInput(posterAt).outputOptions(["-frames:v 1", "-q:v 3"]).output(posterPath)
      );

      const source = parseSize(codecData);
      const height = source ? Math.min(PREVIEW_HEIGHT, source.height) : PREVIEW_HEIGHT;
      const width = source ? Math.round((source.width * height) / source.height / 2) * 2 : 0;
      return { previewPath, posterPath, width, height, durationSec };
    } catch (err) {
      await fs.promises.unlink(previewPath).catch(() => {});
      await fs.promises.unlink(posterPath).catch(() => {});
      throw err;
    }
  });
}

async function generateImagePreview(inputPath) {
  return imageQueue(async () => {
    const previewPath = tempPath(".jpg");
    try {
      await sharp(inputPath, { sequentialRead: true, limitInputPixels: 100_000_000 })
        .rotate()
        .resize({ width: 1080, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toFile(previewPath);
      return previewPath;
    } catch (err) {
      await fs.promises.unlink(previewPath).catch(() => {});
      throw err;
    }
  });
}

module.exports = { generateVideoPreview, generateImagePreview, PREVIEW_HEIGHT };
