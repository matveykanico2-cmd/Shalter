const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const S3_BUCKET = process.env.S3_BUCKET;
const isS3Enabled = !!S3_BUCKET;
const S3_PREFIX = process.env.S3_PREFIX ? `${process.env.S3_PREFIX.replace(/\/+$/, "")}/` : "";

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
  });
  return _client;
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
  const local = localCopy(filename);
  if (local) return fs.statSync(local).size;
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const head = await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }));
    return head.ContentLength ?? null;
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
  await fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await client()
    .send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename) }))
    .catch(() => {});
}

async function readRange(filename, start, end) {
  if (!isS3Enabled) {
    return fs.createReadStream(path.join(UPLOAD_DIR, filename), { start, end });
  }
  const local = localCopy(filename);
  if (local) return fs.createReadStream(local, { start, end });
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const res = await client().send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(filename), Range: `bytes=${start}-${end ?? ""}` })
  );
  return res.Body;
}

async function readHeader(filename) {
  const fileCrypto = require("./fileCrypto");
  if (!isS3Enabled || localCopy(filename)) return fileCrypto.readHeader(path.join(UPLOAD_DIR, filename));
  try {
    const stream = await readRange(filename, 0, fileCrypto.HEADER_MAX - 1);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return fileCrypto.headerFromBuffer(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

module.exports = { isS3Enabled, UPLOAD_DIR, createWriteTarget, exists, sizeOf, finalizeDedup, deleteObject, readRange, readHeader };
