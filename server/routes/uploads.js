const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createEncryptStream } = require("../lib/fileCrypto");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { UPLOADABLE_KINDS, limitFor, tooLargeError, UPLOAD_LIMITS, DEFAULT_LIMIT } = require("../lib/uploadLimits");
const storage = require("../lib/storage");

// Real file uploads, streamed straight to disk.
//
// The body is the raw file (Content-Type: application/octet-stream), not
// multipart — a browser's fetch() streams a File/Blob body as-is, so this needs
// no multipart parser (no new dependency) and never holds the file in memory on
// either side. express.json() upstream only claims application/json, so these
// requests pass through it untouched.
//
// This replaces attachments-as-base64-data-URLs for anything file-shaped. That
// old path read the whole file into a JS string in the browser, inflated it by
// a third, and posted it inside the message JSON — which is why the effective
// ceiling was ~25MB regardless of what any limit said.

const router = express.Router();
router.use(requireUserId);

// Extension only, taken from the client-supplied name and hard-restricted — the
// stored filename is otherwise random, so a crafted name can't traverse
// directories or land an executable extension somewhere it'd be served as code.
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
    // Fail before a single byte moves when the browser tells us the size up
    // front — the alternative is transferring 2GB and then rejecting it.
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      return res.status(413).json({ error: tooLargeError(kind) });
    }

    const name = String(req.query.name ?? "file").slice(0, 300);
    const id = `${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
    const filename = `${id}${safeExtension(name)}`;

    let written = 0;
    let aborted = false;
    // Хранилище — диск или S3, смотря что настроено (lib/storage.js); отсюда
    // и дальше код не знает, куда именно льются байты.
    const { stream: out, done, abort } = storage.createWriteTarget(filename);
    // Файл кладётся зашифрованным (см. lib/fileCrypto.js) вне зависимости от
    // хранилища. Отпечаток для дедупликации считается по исходному
    // содержимому, до шифрования, — иначе два одинаковых файла давали бы
    // разные имена: у каждого свой вектор.
    const cipher = createEncryptStream(path.join(process.cwd(), "data"), out);
    // Отпечаток содержимого считается на лету, пока файл пишется, — второй раз
    // читать его ради этого не нужно.
    const digest = crypto.createHash("sha256");

    // Cleans up the partial file on any failure — an aborted 2GB upload must not
    // leave 1.9GB of garbage sitting in storage.
    const discard = () => storage.deleteObject(filename).catch(() => {});

    try {
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => {
          if (aborted) return;
          written += chunk.length;
          digest.update(chunk);
          // A lying or absent Content-Length is the case this covers: enforced
          // again against what actually arrives, and the connection is cut the
          // moment it goes over rather than after the whole file lands.
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
        req.pipe(cipher);
      });
    } catch (err) {
      await discard();
      return res.status(err.status ?? 500).json({ error: err.message || "Не удалось загрузить файл" });
    }

    if (written === 0) {
      await discard();
      return res.status(400).json({ error: "Пустой файл" });
    }

    // Один и тот же файл хранится один раз.
    //
    // Картинку, которую переслали сотне человек, раньше сервер записывал сотней
    // одинаковых копий: имя файла складывалось из времени и случайных байт, и
    // о совпадении содержимого никто не спрашивал. На пересылаемом — мемах,
    // фотографиях из общих чатов, одном и том же документе — это и есть
    // основной расход места.
    //
    // Теперь имя выводится из содержимого: у одинаковых файлов оно совпадает.
    // Если такой файл уже лежит, только что записанный удаляется, а ссылка
    // отдаётся на существующий. Формат имени прежний (см. isSafeUrl в
    // lib/sanitizeAttachments.js), поэтому старые ссылки продолжают работать.
    //
    // Файл не удаляется, пока на него ссылается хоть одно сообщение, — а раз
    // содержимое одинаковое, любая из ссылок ведёт к тому же самому.
    const hash = digest.digest("hex").slice(0, 16);
    const dedupName = `sha_${hash}${safeExtension(name)}`;
    const filenameFinal = await storage.finalizeDedup(filename, dedupName);

    res.json({
      // Relative on purpose: the app is same-origin, and a stored absolute URL
      // would break the moment the deployment's hostname or scheme changed.
      url: `/uploads/${filenameFinal}`,
      name,
      size: written,
      mimeType: String(req.query.mimeType ?? "").slice(0, 120) || undefined,
      kind,
    });
  })
);

module.exports = router;
