const path = require("path");
const { createDecryptStream, HEADER_LEN } = require("./fileCrypto");
const storage = require("./storage");
const { MAGIC: COMPRESS_MAGIC, decompressStream } = require("./fileCompression");

// Serves an uploaded file (data/uploads — see routes/uploads.js).
//
// Not express.static: a 2GB video needs real HTTP Range support, or the browser
// can only play it from the start and seeking does nothing. express.static does
// handle ranges, but it also needs the directory to be publicly mounted with its
// own path semantics; doing it here keeps the filename validation, the
// Content-Disposition, and the no-execute headers in one obvious place.

// Buffers a short stream fully — only ever used to read the few-byte
// compression marker below, never a whole file.
function collect(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

const MIME = {
  ".mp4": "video/mp4",
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

// Only ever the exact shape routes/uploads.js writes: a random id, optionally
// one short extension. Anything else is refused rather than normalized, so no
// amount of traversal encoding gets out of the directory.
const FILENAME_RE = /^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;

// uploadDir остаётся параметром ради обратной совместимости вызова (см.
// server/index.js), но фактическим хранилищем распоряжается lib/storage.js —
// сама функция не знает и не спрашивает, диск это или S3.
function serveUpload() {
  return async (req, res) => {
    const filename = req.params.filename ?? "";
    if (!FILENAME_RE.test(filename)) return res.status(404).end();

    try {
      const size = await storage.sizeOf(filename);
      if (size == null) return res.status(404).end();

      // Файл в хранилище зашифрован (lib/fileCrypto.js). Наружу отдаётся
      // исходное содержимое, поэтому все размеры считаются без служебного
      // заголовка, а поток пропускается через расшифровщик.
      //
      // Файлы, записанные до появления шифрования, метки не имеют и отдаются
      // как есть — перешифровывать уже лежащее не требуется.
      const dataDir = path.join(process.cwd(), "data");
      const header = await storage.readHeader(filename);
      const contentSize = header ? size - HEADER_LEN : size;

      // Brotli-compressed at rest (lib/fileCompression.js) — only ever true
      // for a kind="file" upload, never image/video/voice/etc. Detected by
      // decrypting just the first few plaintext bytes and checking for the
      // marker, rather than trusting anything about the filename/extension.
      let compressed = false;
      if (header && contentSize >= COMPRESS_MAGIC.length) {
        const magicCipher = await storage.readRange(filename, HEADER_LEN, HEADER_LEN + COMPRESS_MAGIC.length - 1);
        const magicPlain = await collect(magicCipher.pipe(createDecryptStream(dataDir, header.iv, 0)));
        compressed = magicPlain.equals(COMPRESS_MAGIC);
      }

      const openAt = async (start, end) => {
        const from = header ? HEADER_LEN + start : start;
        const to = header ? HEADER_LEN + end : end;
        const raw = await storage.readRange(filename, from, to);
        return header ? raw.pipe(createDecryptStream(dataDir, header.iv, start)) : raw;
      };
      // Whole-file only — brotli output can't be decompressed starting from
      // an arbitrary byte offset the way AES-CTR can be decrypted from one
      // (see fileCompression.js), so a compressed file has no Range support
      // at all, ever. The true (decompressed) size isn't known without
      // decompressing it, so this also can't set a Content-Length — it's
      // served chunked instead (Node does that automatically whenever the
      // header is never set).
      const openCompressed = async () => {
        const from = HEADER_LEN + COMPRESS_MAGIC.length;
        const raw = await storage.readRange(filename, from, size - 1);
        return raw.pipe(createDecryptStream(dataDir, header.iv, COMPRESS_MAGIC.length)).pipe(decompressStream());
      };

      const ext = path.extname(filename);
      const type = MIME[ext];

      // An uploaded file is untrusted content served from this app's own origin,
      // so anything the browser might *render* (SVG with a <script>, an .html)
      // would run as same-origin script. Unknown types download instead of
      // rendering, and nosniff stops the browser second-guessing that.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", type ?? "application/octet-stream");
      if (!type || ext === ".svg") res.setHeader("Content-Disposition", "attachment");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable"); // the name is random and content never changes

      if (compressed) {
        res.setHeader("Accept-Ranges", "none");
        if (req.method === "HEAD") return res.end();
        return (await openCompressed()).pipe(res);
      }
      res.setHeader("Accept-Ranges", "bytes");

      // Range support — this is what makes seeking in a long video work at all,
      // and what lets a browser resume a large download.
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
            // "bytes=-500" means the *last* 500 bytes.
            start = Math.max(0, contentSize - Number(match[2]));
            end = contentSize - 1;
          }
          if (start !== undefined && start < contentSize && end >= start) {
            end = Math.min(end, contentSize - 1);
            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${contentSize}`);
            res.setHeader("Content-Length", end - start + 1);
            if (req.method === "HEAD") return res.end();
            return (await openAt(start, end)).pipe(res);
          }
          res.status(416).setHeader("Content-Range", `bytes */${contentSize}`);
          return res.end();
        }
      }

      res.setHeader("Content-Length", contentSize);
      if (req.method === "HEAD") return res.end();
      (await openAt(0, contentSize - 1)).pipe(res);
    } catch (err) {
      if (!res.headersSent) res.status(500).end();
    }
  };
}

// Removes the files behind a set of attachments — called when a message or a
// whole chat is deleted, so a 2GB video doesn't sit on disk forever after the
// only message pointing at it is gone. Silent on anything it can't remove: a
// missing file is the desired end state anyway.
async function deleteUploadedFiles(attachments) {
  for (const a of attachments ?? []) {
    const url = a?.url;
    if (typeof url !== "string" || !url.startsWith("/uploads/")) continue;
    const filename = url.slice("/uploads/".length);
    if (!FILENAME_RE.test(filename)) continue;
    await storage.deleteObject(filename);
  }
}

module.exports = { serveUpload, deleteUploadedFiles, FILENAME_RE };
