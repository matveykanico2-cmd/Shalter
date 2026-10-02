const path = require("path");
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

const FILENAME_RE = /^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;

function serveUpload() {
  return async (req, res) => {
    const filename = req.params.filename ?? "";
    if (!FILENAME_RE.test(filename)) return res.status(404).end();

    try {
      const size = await storage.sizeOf(filename);
      if (size == null) return res.status(404).end();

      const dataDir = path.join(process.cwd(), "data");
      const header = await storage.readHeader(filename);
      const headerLen = header ? header.len : 0;
      const contentSize = size - headerLen;

      let compressed = false;
      if (header && contentSize >= COMPRESS_MAGIC.length) {
        const magicCipher = await storage.readRange(filename, headerLen, headerLen + COMPRESS_MAGIC.length - 1);
        const magicPlain = await collect(magicCipher.pipe(createDecryptStream(dataDir, header, 0)));
        compressed = magicPlain.equals(COMPRESS_MAGIC);
      }

      const openAt = async (start, end) => {
        const raw = await storage.readRange(filename, headerLen + start, headerLen + end);
        return header ? raw.pipe(createDecryptStream(dataDir, header, start)) : raw;
      };
      const openCompressed = async () => {
        const from = headerLen + COMPRESS_MAGIC.length;
        const raw = await storage.readRange(filename, from, size - 1);
        return raw.pipe(createDecryptStream(dataDir, header, COMPRESS_MAGIC.length)).pipe(decompressStream());
      };

      const ext = path.extname(filename);
      const type = MIME[ext];

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", type ?? "application/octet-stream");
      if (!type || ext === ".svg") res.setHeader("Content-Disposition", "attachment");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

      if (compressed) {
        res.setHeader("Accept-Ranges", "none");
        if (req.method === "HEAD") return res.end();
        return (await openCompressed()).pipe(res);
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
