const path = require("path");
const { pipeline } = require("stream");
const { createDecryptStream } = require("./fileCrypto");
const storage = require("./storage");
const { MAGIC: COMPRESS_MAGIC, decompressStream } = require("./fileCompression");

function collect(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// Без типа файл уходит как application/octet-stream + attachment — браузер его не
// проигрывает, а скачивает. Поэтому здесь все форматы, которые браузеры умеют показать.
const MIME = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".3gp": "video/3gpp",
  ".ogv": "video/ogg",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".weba": "audio/webm",
  ".m4b": "audio/mp4",
  ".amr": "audio/amr",
  ".caf": "audio/x-caf",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};

const FILENAME_RE = /^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;

function contentTypeFor(filename) {
  return MIME[path.extname(String(filename)).toLowerCase()];
}

// Как отдавать файл — одно правило для Node и для редиректа в бакет.
// attachment — только скачивание (svg и неизвестные типы); sandbox — CSP «sandbox», чтобы
// файл, открытый как документ, был без скриптов и доступа к сайту (PDF не трогаем:
// встроенный просмотрщик Chrome в песочнице не открывается). direct — можно отдать из
// бакета подписанной ссылкой: бакет не ставит nosniff и CSP, поэтому туда уходят только
// картинки, видео и аудио — их браузер показывает как медиа, а не как документ.
function responseFor(filename) {
  const ext = path.extname(String(filename)).toLowerCase();
  const known = contentTypeFor(filename);
  const type = known ?? "application/octet-stream";
  const attachment = !known || ext === ".svg";
  return {
    type,
    attachment,
    sandbox: ext !== ".pdf",
    direct: !attachment && /^(image|video|audio)\//.test(type),
  };
}

// .pipe() не передаёт ошибки дальше: сбой чтения или расшифровки без
// обработчика — это необработанное исключение и падение всего процесса.
const noop = () => {};
function chain(...streams) {
  return pipeline(...streams, noop);
}

// Заголовки, которые ставит serveOnce, — сбрасываются перед повтором.
const RESPONSE_HEADERS = ["content-type", "content-disposition", "content-security-policy", "cache-control", "accept-ranges", "content-range", "content-length"];

function serveUpload() {
  return async (req, res) => {
    const filename = req.params.filename ?? "";
    if (!FILENAME_RE.test(filename)) return res.status(404).end();

    // Объект, зашифрованный приложением, могут перешифровать прямо сейчас (в том числе
    // скриптом в другом процессе): чтения привязаны к его ETag, и если он сменился до
    // отправки ответа — начинаем заново, уже с новой версией.
    for (let attempt = 0; ; attempt++) {
      try {
        return await serveOnce(req, res, filename);
      } catch (err) {
        if (attempt === 0 && storage.isChangedError(err) && !res.headersSent) {
          res.statusCode = 200;
          for (const h of RESPONSE_HEADERS) res.removeHeader(h);
          continue;
        }
        if (!res.headersSent) res.status(500).end();
        return;
      }
    }
  };
}

async function serveOnce(req, res, filename) {
  const info = await storage.objectInfo(filename);
  if (!info) return res.status(404).end();
  const size = info.size;
  const how = responseFor(filename);

  // Открытый объект в S3 (шифрует хранилище): доступ уже проверен — отдаёт сам бакет.
  if (info.plain && storage.directDownloads && how.direct) {
    const { url, maxAge } = storage.presignedGetUrl(filename, {
      contentType: how.type,
      cacheControl: "private, max-age=31536000, immutable",
    });
    res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
    return res.redirect(302, url);
  }

  const dataDir = path.join(process.cwd(), "data");
  const ifMatch = info.etag;
  const header = await storage.readHeader(filename, info);
  const headerLen = header ? header.len : 0;
  const contentSize = size - headerLen;

  let compressed = false;
  if (header && contentSize >= COMPRESS_MAGIC.length) {
    const magicCipher = await storage.readRange(filename, headerLen, headerLen + COMPRESS_MAGIC.length - 1, { ifMatch });
    const magicPlain = await collect(chain(magicCipher, createDecryptStream(dataDir, header, 0)));
    compressed = magicPlain.equals(COMPRESS_MAGIC);
  }

  const openAt = async (start, end) => {
    const raw = await storage.readRange(filename, headerLen + start, headerLen + end, { ifMatch });
    return header ? chain(raw, createDecryptStream(dataDir, header, start)) : raw;
  };
  const openCompressed = async () => {
    const from = headerLen + COMPRESS_MAGIC.length;
    const raw = await storage.readRange(filename, from, size - 1, { ifMatch });
    return chain(raw, createDecryptStream(dataDir, header, COMPRESS_MAGIC.length), decompressStream());
  };

  res.setHeader("X-Content-Type-Options", "nosniff");
  if (how.sandbox) res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Content-Type", how.type);
  if (how.attachment) res.setHeader("Content-Disposition", "attachment");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  if (compressed) {
    res.setHeader("Accept-Ranges", "none");
    if (req.method === "HEAD") return res.end();
    return chain(await openCompressed(), res);
  }
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (match) {
      const hasStart = match[1] !== "";
      const hasEnd = match[2] !== "";
      let start;
      let end;
      if (hasStart) {
        start = Number(match[1]);
        end = hasEnd ? Number(match[2]) : contentSize - 1;
      } else if (hasEnd) {
        start = Math.max(0, contentSize - Number(match[2]));
        end = contentSize - 1;
      }
      if (start !== undefined && start < contentSize && end >= start) {
        end = Math.min(end, contentSize - 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${contentSize}`);
        res.setHeader("Content-Length", end - start + 1);
        if (req.method === "HEAD") return res.end();
        return chain(await openAt(start, end), res);
      }
      res.status(416).setHeader("Content-Range", `bytes */${contentSize}`);
      return res.end();
    }
  }

  res.setHeader("Content-Length", contentSize);
  if (req.method === "HEAD") return res.end();
  chain(await openAt(0, contentSize - 1), res);
}

async function deleteUploadedFiles(attachments) {
  for (const a of attachments ?? []) {
    const url = a?.url;
    if (typeof url !== "string" || !url.startsWith("/uploads/")) continue;
    const filename = url.slice("/uploads/".length);
    if (!FILENAME_RE.test(filename)) continue;
    await storage.deleteObject(filename);
  }
}

module.exports = { serveUpload, deleteUploadedFiles, contentTypeFor, responseFor, FILENAME_RE };
