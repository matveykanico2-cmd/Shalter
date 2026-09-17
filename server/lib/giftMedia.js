const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// Вырезание фона у gif-анимации подарка — хромакеем, а не сегментацией: сервер
// маленький (2 ядра/2ГБ, см. DEPLOY.md), полноценная ML-модель для выделения
// объекта туда просто не влезет. Хромакей работает надёжно ровно тогда, когда
// фон однотонный, — а это и есть обычный формат для стикеров/анимаций
// подарков, под который эта фича рассчитана. Сложную сцену с градиентом или
// фотографией так не разделить — админ увидит на превью, что фон не вырезался,
// и подберёт другую гифку.

function tempPath(ext) {
  return path.join(os.tmpdir(), `shalter_gift_${crypto.randomBytes(8).toString("hex")}${ext}`);
}

// Цвет фона берётся усреднением четырёх углов первого кадра, а не одного
// пикселя, — так шум сжатия в одном углу не собьёт хромакей на весь ролик.
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

// Прогоняет входной gif/видео через ffmpeg: определяет цвет фона по первому
// кадру, вырезает его через фильтр colorkey и перекодирует в gif с
// прозрачностью (GIF её умеет только как "прозрачно/непрозрачно", без
// полутонов альфа-канала — colorkey ровно так и работает).
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
        // similarity/blend подобраны под чистый однотонный фон: снимают лёгкий
        // шум сжатия по краю фигуры, не трогая её собственные полутона.
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
