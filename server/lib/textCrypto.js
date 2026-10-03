const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const keyring = require("./keyring");

const PREFIX_V1 = "enc1:";
const PREFIX = "enc2:";
const IV_LEN = 12;
const TAG_LEN = 16;
const MAX_PREFIX = 20;

let keys = null;

function loadKeys() {
  if (keys) return keys;
  let master = null;
  const fromEnv = process.env.MESSAGES_KEY;
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    master = Buffer.from(fromEnv, "hex");
  } else {
    const dataDir = path.join(process.cwd(), "data");
    const keyPath = path.join(dataDir, "messages.key");
    try {
      if (fs.existsSync(keyPath)) {
        const k = Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
        if (k.length === 32) master = k;
      }
    } catch {
    }
    if (!master) {
      if (fs.existsSync(keyPath)) {
        throw new Error("data/messages.key повреждён — без него переписку не расшифровать; восстановите файл из резервной копии");
      }
      master = crypto.randomBytes(32);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(keyPath, master.toString("hex"), { mode: 0o600 });
      console.log("[messages] создан ключ шифрования data/messages.key — вынесите его в MESSAGES_KEY и сохраните отдельно от базы");
    }
  }
  const derive = (info) => Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), info, 32));
  keys = {
    enc: derive("shalter/messages/enc"),
    index: derive("shalter/messages/index"),
    kek: derive("shalter/messages/kek"),
  };
  return keys;
}

function isEncrypted(stored) {
  return typeof stored === "string" && (stored.startsWith(PREFIX) || stored.startsWith(PREFIX_V1));
}

function gcmOpen(key, id, raw) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_LEN));
  decipher.setAAD(Buffer.from(String(id)));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
  return Buffer.concat([decipher.update(raw.subarray(IV_LEN, raw.length - TAG_LEN)), decipher.final()]).toString("utf8");
}

function encryptText(id, text) {
  const plain = String(text ?? "");
  if (!plain) return "";
  const { id: keyId, key } = keyring.currentKey("messages", loadKeys().kek);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(String(id)));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${keyId}:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64")}`;
}

function decryptText(id, stored) {
  if (!isEncrypted(stored)) return stored ?? "";
  try {
    if (stored.startsWith(PREFIX_V1)) {
      return gcmOpen(loadKeys().enc, id, Buffer.from(stored.slice(PREFIX_V1.length), "base64"));
    }
    const rest = stored.slice(PREFIX.length);
    const colon = rest.indexOf(":");
    const keyId = Number(rest.slice(0, colon));
    if (colon < 1 || !Number.isInteger(keyId)) throw new Error("bad key id");
    const key = keyring.getKey("messages", keyId, loadKeys().kek);
    return gcmOpen(key, id, Buffer.from(rest.slice(colon + 1), "base64"));
  } catch {
    console.error(`[messages] не удалось расшифровать сообщение ${id}`);
    return "⚠️ Сообщение не удалось расшифровать";
  }
}

// ── Секретные чаты ─────────────────────────────────────────────────────────
// У каждого секретного чата свой случайный ключ. В базе он лежит обёрнутым
// мастер-ключом (kek), поэтому сервер может расшифровать переписку, но утечка
// одной таблицы messages ничего не даёт: текст зашифрован дважды — ключом чата
// внутри и общим ключом сообщений снаружи (encryptText).
const SECRET_KEY_PREFIX = "sk1:";
const SECRET_PREFIX = "sec1:";
const secretKeyCache = new Map();

function gcmSeal(key, aad, plain) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

function gcmOpenRaw(key, aad, b64) {
  const raw = Buffer.from(b64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_LEN));
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
  return Buffer.concat([decipher.update(raw.subarray(IV_LEN, raw.length - TAG_LEN)), decipher.final()]);
}

function newSecretChatKey(chatId) {
  return SECRET_KEY_PREFIX + gcmSeal(loadKeys().kek, `secret-chat:${chatId}`, crypto.randomBytes(32));
}

function secretChatKey(chatId, wrapped) {
  if (!wrapped?.startsWith(SECRET_KEY_PREFIX)) return null;
  let key = secretKeyCache.get(chatId);
  if (!key) {
    key = gcmOpenRaw(loadKeys().kek, `secret-chat:${chatId}`, wrapped.slice(SECRET_KEY_PREFIX.length));
    secretKeyCache.set(chatId, key);
  }
  return key;
}

function sealSecret(chatId, wrapped, messageId, text) {
  const plain = String(text ?? "");
  if (!plain) return "";
  const key = secretChatKey(chatId, wrapped);
  if (!key) throw new Error("secret chat key missing");
  return SECRET_PREFIX + gcmSeal(key, messageId, Buffer.from(plain, "utf8"));
}

function isSealedSecret(text) {
  return typeof text === "string" && text.startsWith(SECRET_PREFIX);
}

function openSecret(chatId, wrapped, messageId, text) {
  if (!isSealedSecret(text)) return text;
  try {
    return gcmOpenRaw(secretChatKey(chatId, wrapped), messageId, text.slice(SECRET_PREFIX.length)).toString("utf8");
  } catch {
    console.error(`[messages] не удалось расшифровать сообщение секретного чата ${messageId}`);
    return "⚠️ Сообщение не удалось расшифровать";
  }
}

function words(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function token(kind, value) {
  return crypto.createHmac("sha256", loadKeys().index).update(`${kind}:${value}`).digest("hex").slice(0, 16);
}

function searchTokens(text) {
  const out = new Set();
  for (const w of new Set(words(text))) {
    out.add(token("w", w));
    const chars = [...w];
    for (let i = 1; i <= Math.min(chars.length, MAX_PREFIX); i++) out.add(token("p", chars.slice(0, i).join("")));
  }
  return [...out].join(" ");
}

function searchQuery(query) {
  const list = words(query);
  if (!list.length) return null;
  return list
    .map((w, i) => (i === list.length - 1 ? token("p", [...w].slice(0, MAX_PREFIX).join("")) : token("w", w)))
    .join(" AND ");
}

function hasLink(text) {
  return /http/i.test(String(text ?? "")) ? 1 : 0;
}

module.exports = { encryptText, decryptText, isEncrypted, searchTokens, searchQuery, hasLink, loadKeys, newSecretChatKey, sealSecret, openSecret, isSealedSecret };
