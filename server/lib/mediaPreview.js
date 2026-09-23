const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

// Память sharp — не память JavaScript: её не видно в --max-old-space-size, но
// она входит в то, по чему pm2 перезапускает процесс (max_memory_restart в
// ecosystem.config.js). По умолчанию sharp держит кэш операций и запускает по
// потоку на каждое ядро; пачка фотографий с телефона разом поднимала процесс
// за предел, pm2 его убивал — и у всех, кто в этот момент что-то загружал,
// выходило «Не удалось загрузить». На маленьком сервере эскизу хватает одного
// потока, а кэш тут бесполезен: каждая картинка обрабатывается один раз.
sharp.cache(false);
sharp.concurrency(1);

// Лёгкое превью тяжёлого вложения: 240p-копия видео с кадром-обложкой и
// уменьшенная картинка. В переписке показывается именно превью, оригинал
// скачивается отдельно и по требованию — иначе пятигигабайтный ролик
// приходилось бы тянуть целиком, чтобы увидеть, что в нём.
//
// Здесь только файлы: на входе путь к расшифрованному оригиналу, на выходе
// путь к временному файлу. Куда результат ляжет дальше (диск или S3, с
// шифрованием) — дело вызывающего кода (routes/messages.js), как и удаление
// временных файлов.
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const PREVIEW_HEIGHT = 240;
// Перекодирование длинного ролика может идти дольше, чем имеет смысл ждать:
// два ядра на весь сервер, и они же обслуживают звонки. Зависший или
// безнадёжно долгий джоб снимается, сообщение остаётся с оригиналом.
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

// Очередь на одно задание за раз. Процесс один (см. AGENTS.md), сервер — два
// ядра, и два одновременных перекодирования отнимают их оба у WS-сигналинга
// звонков. Внешняя очередь ради этого не нужна: задания живут ровно столько,
// сколько живёт процесс, и переживать перезапуск им незачем — сообщение при
// потере превью просто останется с оригиналом.
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
// Картинки идут мимо видео-очереди: sharp — это доли секунды, и ждать за
// получасовым перекодированием ролика эскизу не за чем.
const imageQueue = createQueue(2);

function tempPath(ext) {
  return path.join(os.tmpdir(), `shalter_preview_${crypto.randomBytes(8).toString("hex")}${ext}`);
}

// "00:01:23.45" -> 83.45
function parseDuration(value) {
  const parts = String(value ?? "").split(":");
  if (parts.length !== 3) return 0;
  const seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return Number.isFinite(seconds) ? seconds : 0;
}

// Разрешение берётся из того, что ffmpeg сам пишет о входном потоке
// (codecData): отдельного ffprobe в ffmpeg-static нет, а ставить второй
// бинарник ради двух чисел незачем.
function parseSize(codecData) {
  for (const detail of codecData?.video_details ?? []) {
    // Разрешение приходит внутри более длинной строки вида
    // "640x480 [SAR 1:1 DAR 4:3]" — отсюда поиск по подстроке, а не сравнение.
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

// 240p-копия ролика плюс отдельный кадр-обложка. Возвращает пути к временным
// файлам и размеры уже готового превью (не оригинала) — по ним клиент рисует
// место под видео до его загрузки.
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
          .audioBitrate("64k")
          .outputOptions([
            `-vf scale=-2:${PREVIEW_HEIGHT}`,
            "-preset veryfast",
            "-crf 30",
            // Потолок битрейта — чтобы часовая запись не выросла в сотни
            // мегабайт вопреки crf: «лёгкое превью» должно оставаться лёгким
            // независимо от длины.
            "-maxrate 400k",
            "-bufsize 800k",
            "-pix_fmt yuv420p",
            // Заголовок в начало файла: без этого браузер не начнёт
            // воспроизведение, пока не скачает ролик целиком.
            "-movflags +faststart",
          ])
          .output(previewPath)
      );

      const durationSec = Math.round(parseDuration(codecData?.duration));
      // Кадр берётся с первой секунды, а не с нулевой: в начале ролика часто
      // чёрный кадр, и обложкой он не годится.
      const posterAt = durationSec > 2 ? 1 : 0;
      await runFfmpeg((cmd) =>
        cmd.input(previewPath).seekInput(posterAt).outputOptions(["-frames:v 1", "-q:v 4"]).output(posterPath)
      );

      const source = parseSize(codecData);
      const height = PREVIEW_HEIGHT;
      // scale=-2 округляет ширину до чётной — считаем так же, иначе размер в
      // сообщении разойдётся с настоящим на пиксель.
      const width = source ? Math.round((source.width * height) / source.height / 2) * 2 : 0;
      return { previewPath, posterPath, width, height, durationSec };
    } catch (err) {
      await fs.promises.unlink(previewPath).catch(() => {});
      await fs.promises.unlink(posterPath).catch(() => {});
      throw err;
    }
  });
}

// Уменьшенная копия картинки. rotate() без аргументов применяет поворот из
// EXIF — без него фотографии с телефона лежат на боку.
async function generateImagePreview(inputPath) {
  return imageQueue(async () => {
    const previewPath = tempPath(".jpg");
    try {
      // sequentialRead — читать сверху вниз, не держа всю расжатую картинку в
      // памяти целиком; limitInputPixels — не браться за «картинку» в сотни
      // мегапикселей, которая съела бы всю память сервера одна.
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
