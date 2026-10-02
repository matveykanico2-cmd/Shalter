const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createEncryptStream } = require("../lib/fileCrypto");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { UPLOADABLE_KINDS, limitFor, tooLargeError, UPLOAD_LIMITS, DEFAULT_LIMIT } = require("../lib/uploadLimits");
const storage = require("../lib/storage");
const { MAGIC: COMPRESS_MAGIC, compressStream } = require("../lib/fileCompression");

const router = express.Router();
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
    const { stream: out, done, abort } = storage.createWriteTarget(filename);
    const cipher = createEncryptStream(path.join(process.cwd(), "data"), out);
    const digest = crypto.createHash("sha256");

    const compressing = kind === "file";
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
        cipher.on("error", reject);
        done().then(resolve, reject);
        cipher.pipe(out);
        if (compressor) {
          cipher.write(COMPRESS_MAGIC);
          compressor.on("error", reject);
          req.pipe(compressor).pipe(cipher);
        } else {
          req.pipe(cipher);
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
