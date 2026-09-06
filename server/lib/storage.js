const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");

// Куда физически ложатся вложения: на диск (по умолчанию) или в S3-совместимое
// хранилище (Яндекс Object Storage, Cloudflare R2, AWS S3 — подходит любое с
// S3 API), если задан S3_BUCKET.
//
// Переключение — по одной переменной окружения, и больше ничего не меняется:
// пока S3_BUCKET не задан, всё работает ровно как раньше, байт в байт. Это
// обёртка над routes/uploads.js (запись) и lib/serveUpload.js (чтение с
// Range), а не отдельный слой поверх них — здесь нет ни шифрования, ни
// дедупликации, они остаются там же, где были.
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const S3_BUCKET = process.env.S3_BUCKET;
const isS3Enabled = !!S3_BUCKET;
// Необязательный подкаталог в бакете — на случай если то же хранилище делят
// несколько проектов.
const S3_PREFIX = process.env.S3_PREFIX ? `${process.env.S3_PREFIX.replace(/\/+$/, "")}/` : "";

let _client = null;
function client() {
  if (_client) return _client;
  const { S3Client } = require("@aws-sdk/client-s3");
  // Эндпоинт и регион по умолчанию — Яндекс Object Storage; для AWS/R2/Selectel
  // достаточно переопределить S3_ENDPOINT (и S3_REGION, если нужен другой).
  _client = new S3Client({
    region: process.env.S3_REGION || "ru-central1",
    endpoint: process.env.S3_ENDPOINT || "https://storage.yandexcloud.net",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    // Некоторые S3-совместимые хранилища (обычно самостоятельно поднятый MinIO)
    // умеют только путь-стиль (host/bucket/key) вместо bucket.host/key.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
  });
  return _client;
}

function s3Key(filename) {
  return S3_PREFIX + filename;
}

// Запись нового файла. Возвращает { stream, done, abort }: пишущий код (см.
// routes/uploads.js) льёт в stream — на диске это самый обычный
// fs.WriteStream, в S3 — сквозной PassThrough, который читает
// @aws-sdk/lib-storage's Upload (сам бьёт на части, если файл большой, без
// ограничения в 5 ГБ на PutObject). done() резолвится, когда данные точно
// сохранены; abort() — оборвать незавершённую запись.
function createWriteTarget(filename) {
  if (!isS3Enabled) {
    const out = fs.createWriteStream(path.join(UPLOAD_DIR, filename));
    return {
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
  const upload = new Upload({ client: client(), params: { Bucket: S3_BUCKET, Key: s3Key(filename), Body: body } });
  return {
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
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }));
    return true;
  } catch {
    return false;
  }
}

// Полный размер файла в байтах, или null, если его нет.
async function sizeOf(filename) {
  if (!isS3Enabled) {
    try {
      return fs.statSync(path.join(UPLOAD_DIR, filename)).size;
    } catch {
      return null;
    }
  }
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const head = await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

// Дедупликация (см. routes/uploads.js): только что записанный файл либо
// становится файлом с именем по содержимому (dedupName), либо, если такой уже
// есть, выбрасывается. На диске это переименование; в S3 переименования нет —
// копия на стороне хранилища (без скачивания на сервер и обратно) плюс
// удаление временного объекта. Возвращает итоговое имя файла.
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
        new CopyObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(dedupName), CopySource: `/${S3_BUCKET}/${s3Key(tempName)}` })
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
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await client()
    .send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }))
    .catch(() => {});
}

// Часть файла (или весь файл — start=0, end=undefined) как поток на чтение,
// для отдачи с поддержкой Range (см. lib/serveUpload.js). end включительно,
// как в HTTP-заголовке Range, которым и управляет вызывающий код.
async function readRange(filename, start, end) {
  if (!isS3Enabled) {
    return fs.createReadStream(path.join(UPLOAD_DIR, filename), { start, end });
  }
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const res = await client().send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename), Range: `bytes=${start}-${end ?? ""}` })
  );
  return res.Body; // Readable в Node-окружении
}

// Заголовок шифрования (магическая метка + вектор, см. lib/fileCrypto.js) —
// он же говорит, зашифрован ли файл вообще (старые записи до появления
// шифрования — нет). На диске это синхронное чтение первых байт; в S3 —
// отдельный ranged-запрос, файл целиком качать незачем.
async function readHeader(filename) {
  const fileCrypto = require("./fileCrypto");
  if (!isS3Enabled) return fileCrypto.readHeader(path.join(UPLOAD_DIR, filename));
  try {
    const stream = await readRange(filename, 0, fileCrypto.HEADER_LEN - 1);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return fileCrypto.headerFromBuffer(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

module.exports = { isS3Enabled, UPLOAD_DIR, createWriteTarget, exists, sizeOf, finalizeDedup, deleteObject, readRange, readHeader };
