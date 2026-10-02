const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const keyring = require("./keyring");

const MAGIC = Buffer.from("SHENC1");
const MAGIC2 = Buffer.from("SHENC2");
const IV_LEN = 16;
const HEADER_LEN_V1 = MAGIC.length + IV_LEN;
const HEADER_LEN_V2 = MAGIC2.length + 4 + IV_LEN;
const HEADER_MAX = HEADER_LEN_V2;

let key = null;

function loadKey(dataDir) {
  if (key) return key;
  const fromEnv = process.env.UPLOADS_KEY;
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    key = Buffer.from(fromEnv, "hex");
    return key;
  }
  const keyPath = path.join(dataDir, "uploads.key");
  try {
    if (fs.existsSync(keyPath)) {
      key = Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
      if (key.length === 32) return key;
    }
  } catch {
  }
  key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
    console.log("[uploads] создан ключ шифрования data/uploads.key — для настоящей защиты вынесите его в UPLOADS_KEY и удалите файл");
  } catch (err) {
    console.error("[uploads] не удалось сохранить ключ шифрования:", err.message);
  }
  return key;
}

let fileKek = null;
function loadKek(dataDir) {
  if (!fileKek) fileKek = Buffer.from(crypto.hkdfSync("sha256", loadKey(dataDir), Buffer.alloc(0), "shalter/files/kek", 32));
  return fileKek;
}

function createEncryptStream(dataDir, out) {
  const { id, key: k } = keyring.currentKey("files", loadKek(dataDir));
  const iv = crypto.randomBytes(IV_LEN);
  const keyId = Buffer.alloc(4);
  keyId.writeUInt32BE(id);
  out.write(Buffer.concat([MAGIC2, keyId, iv]));
  return crypto.createCipheriv("aes-256-ctr", k, iv);
}

function parseHeader(buf) {
  if (!buf) return null;
  if (buf.length >= HEADER_LEN_V2 && buf.subarray(0, MAGIC2.length).equals(MAGIC2)) {
    return {
      keyId: buf.readUInt32BE(MAGIC2.length),
      iv: Buffer.from(buf.subarray(MAGIC2.length + 4, HEADER_LEN_V2)),
      len: HEADER_LEN_V2,
    };
  }
  if (buf.length >= HEADER_LEN_V1 && buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    return { keyId: null, iv: Buffer.from(buf.subarray(MAGIC.length, HEADER_LEN_V1)), len: HEADER_LEN_V1 };
  }
  return null;
}

function readHeader(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(HEADER_MAX);
    const read = fs.readSync(fd, buf, 0, HEADER_MAX, 0);
    return parseHeader(buf.subarray(0, read));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

function headerFromBuffer(buf) {
  return parseHeader(buf);
}

function counterAt(iv, byteOffset) {
  const counter = Buffer.from(iv);
  let blocks = Math.floor(byteOffset / 16);
  for (let i = counter.length - 1; i >= 0 && blocks > 0; i--) {
    const sum = counter[i] + (blocks % 256);
    counter[i] = sum % 256;
    blocks = Math.floor(blocks / 256) + (sum > 255 ? 1 : 0);
  }
  return counter;
}

function createDecryptStream(dataDir, header, start) {
  const k = header.keyId != null ? keyring.getKey("files", header.keyId, loadKek(dataDir)) : loadKey(dataDir);
  const decipher = crypto.createDecipheriv("aes-256-ctr", k, counterAt(header.iv, start));
  const skip = start % 16;
  if (skip) decipher.update(Buffer.alloc(skip));
  return decipher;
}

module.exports = { createEncryptStream, createDecryptStream, readHeader, headerFromBuffer, HEADER_MAX, loadKey };
