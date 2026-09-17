const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { createEncryptStream, createDecryptStream, HEADER_LEN } = require("./fileCrypto");
const storage = require("./storage");

const DATA_DIR = path.join(process.cwd(), "data");

// Расшифрованная копия вложения во временном файле: ffmpeg и sharp читают файл
// с диска, а в хранилище он лежит зашифрованным (lib/fileCrypto.js) и,
// возможно, вообще не на этой машине (S3).
async function fetchUploadToTemp(filename) {
  const localPath = path.join(os.tmpdir(), `shalter_src_${crypto.randomBytes(8).toString("hex")}${path.extname(filename)}`);
  const header = await storage.readHeader(filename);
  const raw = await storage.readRange(filename, header ? HEADER_LEN : 0, undefined);
  const source = header ? raw.pipe(createDecryptStream(DATA_DIR, header.iv, 0)) : raw;
  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(localPath);
      raw.on("error", reject);
      source.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
      source.pipe(out);
    });
  } catch (err) {
    await fs.promises.unlink(localPath).catch(() => {});
    throw err;
  }
  return localPath;
}

// Кладёт готовый временный файл в хранилище ровно так же, как это делает
// routes/uploads.js с загруженным: шифрование, имя по содержимому, тот же вид
// ссылки — чтобы результат ничем не отличался от обычного вложения ни для
// раздачи, ни для уборки.
async function storeGeneratedFile(localPath) {
  const ext = path.extname(localPath);
  const tempName = `${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}${ext}`;
  const { stream: out, done, abort } = storage.createWriteTarget(tempName);
  const cipher = createEncryptStream(DATA_DIR, out);
  const digest = crypto.createHash("sha256");
  try {
    await new Promise((resolve, reject) => {
      const source = fs.createReadStream(localPath);
      source.on("data", (chunk) => digest.update(chunk));
      source.on("error", reject);
      cipher.on("error", reject);
      done().then(resolve, reject);
      cipher.pipe(out);
      source.pipe(cipher);
    });
  } catch (err) {
    abort();
    await storage.deleteObject(tempName).catch(() => {});
    throw err;
  }
  const dedupName = `sha_${digest.digest("hex").slice(0, 16)}${ext}`;
  return `/uploads/${await storage.finalizeDedup(tempName, dedupName)}`;
}

module.exports = { fetchUploadToTemp, storeGeneratedFile };
