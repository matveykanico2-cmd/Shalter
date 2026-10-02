const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { ffmpegPath } = require("./ffmpegBinary");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

function tempPath(ext) {
  return path.join(os.tmpdir(), `shalter_gift_${crypto.randomBytes(8).toString("hex")}${ext}`);
}

async function detectBackgroundColor(framePath) {
  const { width, height } = await sharp(framePath).metadata();
  const corners = [
    { left: 0, top: 0 },
    { left: Math.max(0, width - 1), top: 0 },
    { left: 0, top: Math.max(0, height - 1) },
    { left: Math.max(0, width - 1), top: Math.max(0, height - 1) },
  ];
  const samples = await Promise.all(
    corners.map((c) => sharp(framePath).extract({ ...c, width: 1, height: 1 }).raw().toBuffer())
  );
  return [0, 1, 2].map((i) => Math.round(samples.reduce((sum, s) => sum + s[i], 0) / samples.length));
}

async function cutGifBackground(inputPath) {
  const framePath = tempPath(".png");
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath).frames(1).output(framePath).on("end", resolve).on("error", reject).run();
  });

  let hex;
  try {
    const [r, g, b] = await detectBackgroundColor(framePath);
    hex = [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  } finally {
    await fs.promises.unlink(framePath).catch(() => {});
  }

  const outputPath = tempPath(".gif");
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter([
        `[0:v]colorkey=0x${hex}:0.28:0.12,format=rgba,split[a][b]`,
        "[b]palettegen=reserve_transparent=1[p]",
        "[a][p]paletteuse=alpha_threshold=128",
      ])
      .outputOptions(["-loop 0"])
      .output(outputPath)
      .on("end", resolve)
      .on("error", (err) => reject(err))
      .run();
  }).catch(async (err) => {
    await fs.promises.unlink(outputPath).catch(() => {});
    throw err;
  });

  return outputPath;
}

module.exports = { cutGifBackground };
