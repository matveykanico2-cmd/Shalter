const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createEncryptStream } = require("../lib/fileCrypto");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { UPLOADABLE_KINDS, limitFor, tooLargeError, UPLOAD_LIMITS, DEFAULT_LIMIT } = require("../lib/uploadLimits");
const storage = require("../lib/storage");
const { MAGIC: COMPRESS_MAGIC, compressStream } = require("../lib/fileCompression");
const { recordUploader } = require("../lib/uploadAccess");
const { contentTypeFor } = require("../lib/serveUpload");

const router = express.Router();

const ALREADY_COMPRESSED_RE = /^\.(mp4|m4v|mov|webm|mkv|avi|3gp|jpe?g|png|gif|webp|avif|heic|heif|mp3|m4a|aac|ogg|oga|opus|flac|weba|zip|rar|7z|gz|bz2|xz|apk|ipa|dmg|pdf|docx|xlsx|pptx)$/;
router.use(requireUserId);

function safeExtension(name) {
  const ext = path.extname(String(name ?? "")).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : "";
}

router.get("/limits", (_req, res) => {
  res.json({ limits: UPLOAD_LIMITS, defaultLimit: DEFAULT_LIMIT });
});

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const kind = String(req.query.kind ?? "file");
    if (!UPLOADABLE_KINDS.has(kind)) return res.status(400).json({ error: "Неизвестный тип файла" });

    const limit = limitFor(kind);
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      return res.status(413).json({ error: tooLargeError(kind) });
    }

    const name = String(req.query.name ?? "file").slice(0, 300);
    const id = `${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
    const filename = `${id}${safeExtension(name)}`;

    let written = 0;
    let aborted = false;
    const { stream: out, done, abort, plain } = storage.createWriteTarget(filename, { contentType: contentTypeFor(filename) });
    // В S3 с шифрованием на стороне хранилища файл пишется как есть: его отдаёт бакет.
    const cipher = plain ? null : createEncryptStream(path.join(process.cwd(), "data"), out);
    const sink = cipher ?? out;
    const digest = crypto.createHash("sha256");

    // Уже сжатые форматы (видео, картинки, музыка, архивы) brotli не уменьшает, а
    // сжатый файл отдаётся без Range — видео в Safari/iOS без него не играет.
    // Открытый файл в S3 не сжимаем: бакет отдаёт его байты как есть.
    const compressing = !plain && kind === "file" && !ALREADY_COMPRESSED_RE.test(safeExtension(name));
    const compressor = compressing ? compressStream(declared) : null;

    const discard = () => storage.deleteObject(filename).catch(() => {});

    try {
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => {
          if (aborted) return;
          written += chunk.length;
          digest.update(chunk);
          if (written > limit) {
            aborted = true;
            abort();
            req.destroy();
            reject(Object.assign(new Error(tooLargeError(kind)), { status: 413 }));
          }
        });
        req.on("aborted", () => {
          aborted = true;
          abort();
          reject(Object.assign(new Error("Загрузка прервана"), { status: 400 }));
        });
        req.on("error", reject);
        done().then(resolve, reject);
        if (cipher) {
          cipher.on("error", reject);
          cipher.pipe(out);
        }
        if (compressor) {
          sink.write(COMPRESS_MAGIC);
          compressor.on("error", reject);
          req.pipe(compressor).pipe(sink);
        } else {
          req.pipe(sink);
        }
      });
    } catch (err) {
      await discard();
      return res.status(err.status ?? 500).json({ error: err.message || "Не удалось загрузить файл" });
    }

    if (written === 0) {
      await discard();
      return res.status(400).json({ error: "Пустой файл" });
    }

    const hash = digest.digest("hex").slice(0, 16);
    const dedupName = `sha_${hash}${safeExtension(name)}`;
    const filenameFinal = await storage.finalizeDedup(filename, dedupName);
    // Пока файл ни к чему не прикреплён, скачать его может только загрузивший.
    recordUploader(filenameFinal, req.uid);

    res.json({
      url: `/uploads/${filenameFinal}`,
      name,
      size: written,
      mimeType: String(req.query.mimeType ?? "").slice(0, 120) || undefined,
      kind,
    });
  })
);

module.exports = router;
