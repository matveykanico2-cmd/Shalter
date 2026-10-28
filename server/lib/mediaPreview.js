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

// opts — для историй качество выше: 1080p, crf 21, звук 160 кбит/с.
async function generateVideoPreview(inputPath, { height: maxHeight = PREVIEW_HEIGHT, crf = 23, audioBitrate = "128k", maxrate = "3000k" } = {}) {
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
          .audioBitrate(audioBitrate)
          .outputOptions([
            // не растягиваем маленькие видео: высота не больше исходной
            `-vf scale=-2:'min(${maxHeight},ih)'`,
            "-preset veryfast",
            `-crf ${crf}`,
            `-maxrate ${maxrate}`,
            `-bufsize ${parseInt(maxrate, 10) * 2}k`,
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
      const height = source ? Math.min(maxHeight, source.height) : maxHeight;
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

// Копия голосового для проигрывания: AAC в M4A с индексом в начале (+faststart). Запись из
// браузера (WebM) не знает своей длительности и не имеет индекса — плеер не перематывал её
// и ждал загрузки целиком; M4A перематывается сразу и играет везде, включая Safari.
async function generateAudioPreview(inputPath) {
  return videoQueue(async () => {
    const previewPath = tempPath(".m4a");
    try {
      const codecData = await runFfmpeg((cmd) =>
        cmd.input(inputPath).noVideo().audioCodec("aac").audioBitrate("64k").outputOptions(["-movflags +faststart"]).output(previewPath)
      );
      return { previewPath, durationSec: parseDuration(codecData?.duration) };
    } catch (err) {
      await fs.promises.unlink(previewPath).catch(() => {});
      throw err;
    }
  });
}

// Несколько кадров ролика (равномерно по длительности) — чтобы нейросеть,
// понимающая только картинки, могла «посмотреть» видео. Возвращает JPEG-буферы.
async function extractVideoFrames(inputPath, { count = 6, durationSec = 0, width = 640 } = {}) {
  return videoQueue(async () => {
    let duration = durationSec;
    if (!(duration > 0)) {
      const probe = tempPath(".jpg");
      try {
        const codec = await runFfmpeg((cmd) => cmd.input(inputPath).outputOptions(["-frames:v 1"]).output(probe));
        duration = parseDuration(codec?.duration);
      } catch {
      } finally {
        await fs.promises.unlink(probe).catch(() => {});
      }
    }
    const n = duration > 1 ? Math.max(1, Math.min(count, Math.ceil(duration / 2))) : 1;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const at = n === 1 ? Math.min(1, duration / 2 || 0) : (duration * (i + 0.5)) / n;
      const out = tempPath(".jpg");
      try {
        await runFfmpeg((cmd) =>
          cmd.input(inputPath).seekInput(at).outputOptions(["-frames:v 1", `-vf scale='min(${width},iw)':-2`, "-q:v 4"]).output(out)
        );
        frames.push({ at, buf: await fs.promises.readFile(out) });
      } catch {
      } finally {
        await fs.promises.unlink(out).catch(() => {});
      }
    }
    return { frames, durationSec: duration };
  });
}

// Точная длительность аудио/видео. У записей из браузера (WebM) в заголовке её
// нет — плеер показывал «0:00 / 0:00»; поэтому файл прогоняется целиком (голосовые
// и кружки маленькие — это доли секунды) и берётся последнее «time=».
function probeDuration(inputPath) {
  const { spawn } = require("child_process");
  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath || "ffmpeg", ["-hide_banner", "-nostdin", "-i", inputPath, "-vn", "-f", "null", "-"]);
    let err = "";
    ff.stderr.on("data", (c) => {
      err += c;
      if (err.length > 200_000) err = err.slice(-20_000);
    });
    const timer = setTimeout(() => ff.kill("SIGKILL"), 60_000);
    ff.on("error", () => resolve(0));
    ff.on("close", () => {
      clearTimeout(timer);
      const times = [...err.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
      const last = times.at(-1);
      if (last) return resolve(Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]));
      resolve(parseDuration(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(err)?.[1]));
    });
  });
}

module.exports = { generateVideoPreview, generateImagePreview, generateAudioPreview, extractVideoFrames, probeDuration, PREVIEW_HEIGHT };
