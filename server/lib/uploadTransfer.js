const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { createEncryptStream, createDecryptStream } = require("./fileCrypto");
const storage = require("./storage");

const DATA_DIR = path.join(process.cwd(), "data");

async function fetchUploadToTemp(filename) {
  const localPath = path.join(os.tmpdir(), `shalter_src_${crypto.randomBytes(8).toString("hex")}${path.extname(filename)}`);
  const header = await storage.readHeader(filename);
  const raw = await storage.readRange(filename, header ? header.len : 0, undefined);
  const source = header ? raw.pipe(createDecryptStream(DATA_DIR, header, 0)) : raw;
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

// Содержимое загрузки в памяти (до maxBytes) — для Shalter AI: только вложения, которые
// пользователь сам отправил боту в личный чат (см. lib/shalterAi.js).
async function readUploadBuffer(url, maxBytes) {
  const filename = /^\/uploads\/([a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?)$/.exec(String(url ?? ""))?.[1];
  if (!filename) throw new Error("not an upload");
  const size = await storage.sizeOf(filename);
  if (size == null) throw new Error("upload not found");
  // Сжатый файл не больше исходного: заведомо большой не качаем вовсе.
  if (size > maxBytes + 64 * 1024) throw new Error("upload too large");
  const localPath = await fetchUploadToTemp(filename);
  try {
    let buf = await fs.promises.readFile(localPath);
    const { MAGIC, decompressStream } = require("./fileCompression");
    if (buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC)) {
      const { Readable } = require("stream");
      const chunks = [];
      let total = 0;
      for await (const chunk of Readable.from([buf.subarray(MAGIC.length)]).pipe(decompressStream())) {
        total += chunk.length;
        if (total > maxBytes) throw new Error("upload too large");
        chunks.push(chunk);
      }
      buf = Buffer.concat(chunks);
    }
    if (buf.length > maxBytes) throw new Error("upload too large");
    return buf;
  } finally {
    await fs.promises.unlink(localPath).catch(() => {});
  }
}

module.exports = { fetchUploadToTemp, storeGeneratedFile, readUploadBuffer };
