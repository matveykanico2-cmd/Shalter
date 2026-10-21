const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const S3_BUCKET = process.env.S3_BUCKET;
const isS3Enabled = !!S3_BUCKET;
const S3_PREFIX = process.env.S3_PREFIX ? `${process.env.S3_PREFIX.replace(/\/+$/, "")}/` : "";

// С S3_SSE файлы в бакете лежат открытыми байтами, а шифрует их само хранилище: такой
// файл после проверки доступа отдаётся клиенту подписанной ссылкой прямо из бакета, мимо
// Node. Старые зашифрованные приложением объекты перешифровывает uploadsMigration.
// S3_SSE=AES256 | aws:kms (+ S3_SSE_KMS_KEY_ID) — заголовок шифрования с каждым файлом;
// S3_SSE=bucket — полагаемся на шифрование бакета по умолчанию: пока бакет его не
// подтвердил (verifyEncryptionAtRest), файлы шифрует приложение. Без S3_SSE (или с
// S3_APP_ENCRYPTION=1) файлы шифрует приложение и каждый отдаёт Node. Открытыми байтами
// в бакет не пишется ничего, пока не известно, что хранилище шифрует.
const SSE_MODES = new Set(["AES256", "aws:kms", "bucket"]);
const sseMode = SSE_MODES.has(process.env.S3_SSE) ? process.env.S3_SSE : null;
// Настроен ли переход на шифрование хранилища; plainMode — пишем ли открытые байты сейчас.
const plainConfigured = isS3Enabled && process.env.S3_APP_ENCRYPTION !== "1" && !!sseMode;
let plainMode = plainConfigured && sseMode !== "bucket";
if (isS3Enabled && process.env.S3_APP_ENCRYPTION !== "1" && !sseMode) {
  console.warn(
    process.env.S3_SSE
      ? `[s3] S3_SSE=${process.env.S3_SSE} не поддерживается (AES256, aws:kms или bucket) — файлы шифрует приложение`
      : "[s3] S3_SSE не задан — файлы шифрует приложение и отдаёт Node; переход на шифрование хранилища — DEPLOY.md"
  );
}
// S3_DIRECT_DOWNLOAD=0 — открытые файлы всё равно отдаёт Node (например, бакет без CORS).
const directDownloadsWanted = process.env.S3_DIRECT_DOWNLOAD !== "0";
// Пометка открытого объекта в метаданных: x-amz-meta-shalter-format: plain.
const FORMAT_META = "shalter-format";

let _client = null;
function client() {
  if (_client) return _client;
  const { S3Client } = require("@aws-sdk/client-s3");
  _client = new S3Client({
    region: process.env.S3_REGION || "ru-central1",
    endpoint: process.env.S3_ENDPOINT || "https://storage.yandexcloud.net",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    // Контрольные суммы только там, где их требует протокол: сторонние S3 (Яндекс, MinIO,
    // R2) не всегда понимают новые заголовки x-amz-checksum-* SDK.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _client;
}

// Заголовки шифрования хранилища для записи. S3_SSE=bucket — их нет: действует шифрование
// бакета по умолчанию.
function sseParams() {
  if (sseMode !== "AES256" && sseMode !== "aws:kms") return {};
  const params = { ServerSideEncryption: sseMode };
  if (sseMode === "aws:kms" && process.env.S3_SSE_KMS_KEY_ID) params.SSEKMSKeyId = process.env.S3_SSE_KMS_KEY_ID;
  return params;
}

// Шифрует ли хранилище то, что мы пишем открытым. С явным S3_SSE — да (заголовок идёт
// с каждым файлом). С S3_SSE=bucket — спрашиваем у бакета (GetBucketEncryption): есть
// шифрование по умолчанию — с этого момента пишем открытые байты; нет или бакет не ответил —
// файлы по-прежнему шифрует приложение, перешифровка бакета не запускается (fail closed).
// Неудачная проверка повторяется при следующем вызове (сервер — при старте и раз в 10 минут).
async function verifyEncryptionAtRest() {
  if (!plainConfigured) return false;
  if (plainMode) return true;
  const { GetBucketEncryptionCommand } = require("@aws-sdk/client-s3");
  let ok = false;
  try {
    const res = await client().send(new GetBucketEncryptionCommand({ Bucket: S3_BUCKET }));
    ok = (res.ServerSideEncryptionConfiguration?.Rules ?? []).some((r) => r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm);
    if (!ok) console.error("[s3] S3_SSE=bucket, но у бакета нет шифрования по умолчанию — файлы шифрует приложение (DEPLOY.md)");
  } catch (err) {
    const missing = err?.name === "ServerSideEncryptionConfigurationNotFoundError";
    console.error(
      missing
        ? "[s3] S3_SSE=bucket, но у бакета нет шифрования по умолчанию — файлы шифрует приложение (DEPLOY.md)"
        : `[s3] не удалось проверить шифрование бакета (${err?.name ?? "ошибка"}: ${err?.message}) — пока файлы шифрует приложение`
    );
  }
  if (ok) {
    plainMode = true;
    console.log("[s3] шифрование бакета по умолчанию подтверждено — файлы шифрует хранилище");
  }
  return ok;
}

function s3Key(filename) {
  return S3_PREFIX + filename;
}

function localCopy(filename) {
  const full = path.join(UPLOAD_DIR, filename);
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

// plain в ответе — писать ли байты как есть (шифрует хранилище) или шифровать самим:
// решается один раз на файл, по нему же ставится и пометка в метаданных.
function createWriteTarget(filename, { contentType } = {}) {
  if (!isS3Enabled) {
    const out = fs.createWriteStream(path.join(UPLOAD_DIR, filename));
    return {
      plain: false,
      stream: out,
      done: () => new Promise((resolve, reject) => {
        out.on("finish", resolve);
        out.on("error", reject);
      }),
      abort: () => out.destroy(),
    };
  }
  const { Upload } = require("@aws-sdk/lib-storage");
  const body = new PassThrough();
  const plain = plainMode;
  const params = { Bucket: S3_BUCKET, Key: s3Key(filename), Body: body, ...sseParams() };
  if (plain) {
    params.Metadata = { [FORMAT_META]: "plain" };
    if (contentType) params.ContentType = contentType;
  }
  const upload = new Upload({ client: client(), params });
  return {
    plain,
    stream: body,
    done: () => upload.done(),
    abort: () => upload.abort().catch(() => {}),
  };
}

async function exists(filename) {
  if (!isS3Enabled) {
    try {
      return fs.statSync(path.join(UPLOAD_DIR, filename)).isFile();
    } catch {
      return false;
    }
  }
  if (localCopy(filename)) return true;
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }));
    return true;
  } catch {
    return false;
  }
}

async function sizeOf(filename) {
  if (!isS3Enabled) {
    try {
      return fs.statSync(path.join(UPLOAD_DIR, filename)).size;
    } catch {
      return null;
    }
  }
  return (await objectInfo(filename))?.size ?? null;
}

// Что известно об объекте в бакете: открытый ли он и его размер. Открытый объект уже не
// меняется — запоминаем его размер. Зашифрованный приложением не кэшируется: его может
// перешифровать перенос, в том числе скрипт в другом процессе, — каждый раз HEAD, а
// чтения идут с If-Match на его ETag (объект подменили — 412, а не чужие байты).
const PLAIN_CACHE_MAX = 50_000;
const plainSizes = new Map();

function rememberPlain(filename, size) {
  if (plainSizes.size >= PLAIN_CACHE_MAX) plainSizes.delete(plainSizes.keys().next().value);
  plainSizes.set(filename, size);
}

function forget(filename) {
  plainSizes.delete(filename);
}

// { size, plain, local, etag } или null, если файла нет. local — копия ещё на диске
// (до переноса в S3), её отдаёт Node. etag — только у зашифрованного приложением объекта.
async function objectInfo(filename) {
  if (!isS3Enabled) {
    const size = await sizeOf(filename);
    return size == null ? null : { size, plain: false, local: true };
  }
  const local = localCopy(filename);
  if (local) return { size: fs.statSync(local).size, plain: false, local: true };
  if (plainSizes.has(filename)) return { size: plainSizes.get(filename), plain: true, local: false };
  const head = await headObject(filename);
  if (!head) return null;
  const size = head.ContentLength ?? 0;
  const plain = head.Metadata?.[FORMAT_META] === "plain";
  if (plain) rememberPlain(filename, size);
  return { size, plain, local: false, etag: plain ? undefined : head.ETag };
}

// Объект поменялся между HEAD и чтением (If-Match не совпал).
function isChangedError(err) {
  return err?.name === "PreconditionFailed" || err?.$metadata?.httpStatusCode === 412;
}

async function headObject(filename) {
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    return await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }));
  } catch {
    return null;
  }
}

async function finalizeDedup(tempName, dedupName) {
  if (!isS3Enabled) {
    const tempPath = path.join(UPLOAD_DIR, tempName);
    const dedupPath = path.join(UPLOAD_DIR, dedupName);
    try {
      if (fs.existsSync(dedupPath)) {
        await fs.promises.unlink(tempPath).catch(() => {});
      } else {
        await fs.promises.rename(tempPath, dedupPath);
      }
      return dedupName;
    } catch {
      return tempName;
    }
  }
  try {
    if (await exists(dedupName)) {
      await deleteObject(tempName);
    } else {
      const { CopyObjectCommand } = require("@aws-sdk/client-s3");
      await client().send(
        new CopyObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key(dedupName),
          CopySource: `/${S3_BUCKET}/${s3Key(tempName)}`,
          ...sseParams(),
        })
      );
      await deleteObject(tempName);
    }
    return dedupName;
  } catch {
    return tempName;
  }
}

async function deleteObject(filename) {
  if (!isS3Enabled) {
    await fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
    return;
  }
  await fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
  forget(filename);
  noteDeleted(filename);
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await client()
    .send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }))
    .catch(() => {});
}

// ifMatch — ETag из objectInfo: объект подменили после HEAD — ошибка (isChangedError).
async function readRange(filename, start, end, { ifMatch } = {}) {
  if (!isS3Enabled) {
    return fs.createReadStream(path.join(UPLOAD_DIR, filename), { start, end });
  }
  const local = localCopy(filename);
  if (local) return fs.createReadStream(local, { start, end });
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const res = await client().send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename), Range: `bytes=${start}-${end ?? ""}`, IfMatch: ifMatch })
  );
  return res.Body;
}

// Удалённые файлы помнит база (data/uploadDeletions.js): перенос — в том числе скрипт
// в другом процессе — не должен вернуть в бакет файл, который удалили, пока он его
// переписывал (uploadsMigration сверяется до и после замены).
function noteDeleted(filename) {
  try {
    require("../data/uploadDeletions").recordDeletion(filename);
  } catch (err) {
    console.error("upload deletion record failed:", err.message);
  }
}
function deletedSince(filename, since) {
  return require("../data/uploadDeletions").deletedSince(filename, since);
}

// Заголовок шифрования приложения или null, если файл им не зашифрован. Ошибка чтения —
// исключение, а не null: «не прочитали» и «не зашифрован» нельзя путать, иначе шифротекст
// приняли бы за открытые байты. info — уже полученный objectInfo (без лишнего HEAD).
async function readHeader(filename, info) {
  const fileCrypto = require("./fileCrypto");
  if (!isS3Enabled || localCopy(filename)) return fileCrypto.readHeaderStrict(path.join(UPLOAD_DIR, filename));
  info ??= await objectInfo(filename);
  if (!info) throw new Error(`объект ${filename} не найден`);
  // Открытый объект заголовка шифрования не имеет, даже если его байты на него похожи.
  if (info.plain) return null;
  return readRemoteHeader(filename, { ifMatch: info.etag });
}

// Заголовок прямо из бакета, одним GET первых байт — для того, кто уже знает, что объект
// не открытый (перешифровка бакета сама делает HEAD). Ошибка — исключение.
async function readRemoteHeader(filename, { ifMatch } = {}) {
  const fileCrypto = require("./fileCrypto");
  const stream = await readRange(filename, 0, fileCrypto.HEADER_MAX - 1, { ifMatch });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return fileCrypto.headerFromBuffer(Buffer.concat(chunks));
}

// Подписанная ссылка на скачивание объекта прямо из бакета (SigV4, query string).
// Подпись берётся на начало текущего часа и действует два часа: в течение часа ссылка
// на файл одна и та же, и браузер берёт его из своего кэша, не спрашивая ни Node, ни бакет.
const SIGN_WINDOW_S = 3600;

function rfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function presignedGetUrl(filename, { contentType, disposition, cacheControl } = {}, now = Date.now()) {
  const crypto = require("crypto");
  const endpoint = new URL(process.env.S3_ENDPOINT || "https://storage.yandexcloud.net");
  const region = process.env.S3_REGION || "ru-central1";
  const key = s3Key(filename);
  // Как у SDK: бакет в имени хоста, если имя это позволяет и не задан path-style.
  const virtualHost = process.env.S3_FORCE_PATH_STYLE !== "1" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(S3_BUCKET);
  const host = virtualHost ? `${S3_BUCKET}.${endpoint.host}` : endpoint.host;
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  const objectPath = `${basePath}${virtualHost ? "" : `/${rfc3986(S3_BUCKET)}`}/${key.split("/").map(rfc3986).join("/")}`;

  const windowStart = Math.floor(now / 1000 / SIGN_WINDOW_S) * SIGN_WINDOW_S;
  const amzDate = new Date(windowStart * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const expires = 2 * SIGN_WINDOW_S;

  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${process.env.S3_ACCESS_KEY}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  if (cacheControl) query["response-cache-control"] = cacheControl;
  if (contentType) query["response-content-type"] = contentType;
  if (disposition) query["response-content-disposition"] = disposition;
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join("&");

  const canonicalRequest = ["GET", objectPath, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
  const hmac = (k, data) => crypto.createHmac("sha256", k).update(data).digest();
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  let signingKey = hmac(`AWS4${process.env.S3_SECRET_KEY}`, day);
  for (const part of [region, "s3", "aws4_request"]) signingKey = hmac(signingKey, part);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const url = `${endpoint.protocol}//${host}${objectPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  // Сколько ещё браузер может помнить сам редирект: до конца действия подписи, с запасом.
  const maxAge = Math.max(0, windowStart + expires - Math.floor(now / 1000) - 300);
  return { url, maxAge };
}

module.exports = {
  isS3Enabled,
  // Пишем ли открытые байты (шифрует хранилище). Может выключиться после проверки бакета.
  get storesPlain() {
    return plainMode;
  },
  // Настроен ли переход на шифрование хранилища (S3_SSE), даже если оно ещё не подтверждено.
  plainConfigured,
  get directDownloads() {
    return plainMode && directDownloadsWanted;
  },
  sseMode,
  verifyEncryptionAtRest,
  isChangedError,
  readRemoteHeader,
  UPLOAD_DIR,
  client,
  s3Key,
  sseParams,
  FORMAT_META,
  createWriteTarget,
  exists,
  sizeOf,
  objectInfo,
  rememberPlain,
  deletedSince,
  finalizeDedup,
  deleteObject,
  readRange,
  readHeader,
  presignedGetUrl,
  S3_BUCKET,
  S3_PREFIX,
};
