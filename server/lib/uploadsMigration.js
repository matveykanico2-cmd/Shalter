const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const storage = require("./storage");
const fileCrypto = require("./fileCrypto");
const { MAGIC: COMPRESS_MAGIC, decompressStream } = require("./fileCompression");
const { contentTypeFor, FILENAME_RE } = require("./serveUpload");

const UPLOAD_DIR = storage.UPLOAD_DIR;
const DATA_DIR = path.join(process.cwd(), "data");
const MIN_AGE_MS = 60 * 1000;
// Отметка «все объекты бакета уже открытые» — чтобы не перебирать бакет при каждом запуске.
const PLAIN_DONE_MARKER = path.join(DATA_DIR, "s3-plain.done");

function s3Ready() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}

async function remoteHead(name) {
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    return await storage.client().send(new HeadObjectCommand({ Bucket: storage.S3_BUCKET, Key: storage.s3Key(name) }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw err;
  }
}

const isPlainHead = (head) => head?.Metadata?.[storage.FORMAT_META] === "plain";

// Файл, зашифрованный приложением (и, может быть, сжатый), — во временный файл открытыми
// байтами. readRange(start, end) — поток байт исходника с диска или из бакета. header —
// заголовок шифрования, прочитанный строго (ошибка чтения — исключение): null значит
// «файл не зашифрован» и копируется как есть.
async function decodeToTemp({ size, header, readRange }) {
  const tmp = path.join(os.tmpdir(), `shalter_plain_${crypto.randomBytes(8).toString("hex")}`);
  const headerLen = header ? header.len : 0;
  const contentSize = size - headerLen;
  try {
    if (contentSize <= 0) {
      await fs.promises.writeFile(tmp, Buffer.alloc(0));
    } else if (!header) {
      await pipeline(await readRange(0, size - 1), fs.createWriteStream(tmp));
    } else {
      let compressed = false;
      if (contentSize >= COMPRESS_MAGIC.length) {
        const chunks = [];
        await pipeline(
          await readRange(headerLen, headerLen + COMPRESS_MAGIC.length - 1),
          fileCrypto.createDecryptStream(DATA_DIR, header, 0),
          async function* (source) {
            for await (const chunk of source) chunks.push(chunk);
          }
        );
        compressed = Buffer.concat(chunks).equals(COMPRESS_MAGIC);
      }
      if (compressed) {
        await pipeline(
          await readRange(headerLen + COMPRESS_MAGIC.length, size - 1),
          fileCrypto.createDecryptStream(DATA_DIR, header, COMPRESS_MAGIC.length),
          decompressStream(),
          fs.createWriteStream(tmp)
        );
      } else {
        await pipeline(await readRange(headerLen, size - 1), fileCrypto.createDecryptStream(DATA_DIR, header, 0), fs.createWriteStream(tmp));
      }
    }
    return { path: tmp, size: (await fs.promises.stat(tmp)).size };
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
}

// Заливает открытый файл в бакет под именем name (поверх старого объекта, если он был)
// и сверяет: объект открытый и того же размера.
async function uploadPlain(name, tmp) {
  const { Upload } = require("@aws-sdk/lib-storage");
  const params = {
    Bucket: storage.S3_BUCKET,
    Key: storage.s3Key(name),
    Body: fs.createReadStream(tmp.path),
    Metadata: { [storage.FORMAT_META]: "plain" },
    ...storage.sseParams(),
  };
  const type = contentTypeFor(name);
  if (type) params.ContentType = type;
  await new Upload({ client: storage.client(), params }).done();
  const head = await remoteHead(name);
  if (!isPlainHead(head) || head.ContentLength !== tmp.size) {
    throw new Error(`после загрузки объект не совпал: ожидалось ${tmp.size} открытых байт, в S3 ${head?.ContentLength ?? "нет объекта"}`);
  }
}

// Пока файл переписывался, его удалили (сообщение удалено у всех и т. п.) — не воскрешаем.
async function dropIfDeleted(name, since) {
  if (!storage.deletedSince(name, since)) return false;
  await storage.deleteObject(name);
  return true;
}

async function migrateOne(name, stats, { dryRun, deleteLocal }) {
  const full = path.join(UPLOAD_DIR, name);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return;
  }
  if (!stat.isFile()) return;
  if (Date.now() - stat.mtimeMs < MIN_AGE_MS) {
    stats.young += 1;
    return;
  }
  const started = Date.now();
  const head = await remoteHead(name);

  if (storage.storesPlain) {
    // Хранилище шифрует само: на диске файл зашифрован приложением — в бакет он идёт
    // расшифрованным и распакованным.
    if (isPlainHead(head)) {
      stats.already += 1;
    } else {
      if (dryRun) {
        stats.toCopy += 1;
        stats.bytes += stat.size;
        return;
      }
      const tmp = await decodeToTemp({
        size: stat.size,
        header: fileCrypto.readHeaderStrict(full),
        readRange: async (start, end) => fs.createReadStream(full, { start, end }),
      });
      try {
        await uploadPlain(name, tmp);
      } finally {
        await fs.promises.unlink(tmp.path).catch(() => {});
      }
      if (await dropIfDeleted(name, started)) return;
      storage.rememberPlain(name, tmp.size);
      stats.copied += 1;
      stats.bytes += tmp.size;
    }
  } else if (head?.ContentLength !== stat.size) {
    // S3_APP_ENCRYPTION=1: файл переносится как есть, зашифрованным.
    if (dryRun) {
      stats.toCopy += 1;
      stats.bytes += stat.size;
      return;
    }
    const { Upload } = require("@aws-sdk/lib-storage");
    await new Upload({
      client: storage.client(),
      params: { Bucket: storage.S3_BUCKET, Key: storage.s3Key(name), Body: fs.createReadStream(full), ...storage.sseParams() },
    }).done();
    const size = (await remoteHead(name))?.ContentLength;
    if (size !== stat.size) throw new Error(`после загрузки размер не совпал: на диске ${stat.size}, в S3 ${size}`);
    if (await dropIfDeleted(name, started)) return;
    stats.copied += 1;
    stats.bytes += stat.size;
  } else {
    stats.already += 1;
  }

  if (deleteLocal && !dryRun) {
    await fs.promises.unlink(full).catch(() => {});
    stats.deleted += 1;
  }
}

async function runPool(items, concurrency, fn, log) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
      done += 1;
      if (done % 200 === 0) log(`… ${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

async function migrateUploads({ dryRun = false, deleteLocal = false, concurrency = 4, log = () => {} } = {}) {
  if (!s3Ready()) throw new Error("Нужны S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY (см. .env.example)");
  const stats = { total: 0, copied: 0, already: 0, toCopy: 0, young: 0, deleted: 0, failed: 0, bytes: 0 };
  if (!fs.existsSync(UPLOAD_DIR)) return stats;
  // Открытыми байтами пишем, только если хранилище точно шифрует (S3_SSE=bucket — после
  // ответа бакета); иначе файлы уходят в бакет зашифрованными приложением.
  if (storage.plainConfigured) await storage.verifyEncryptionAtRest();

  const names = fs.readdirSync(UPLOAD_DIR);
  stats.total = names.length;
  await runPool(
    names,
    concurrency,
    async (name) => {
      try {
        await migrateOne(name, stats, { dryRun, deleteLocal });
      } catch (err) {
        stats.failed += 1;
        log(`✗ ${name}: ${err.message}`);
      }
    },
    log
  );
  return stats;
}

async function listBucketNames() {
  const { ListObjectsV2Command } = require("@aws-sdk/client-s3");
  const names = [];
  let token;
  do {
    const page = await storage.client().send(
      new ListObjectsV2Command({ Bucket: storage.S3_BUCKET, Prefix: storage.S3_PREFIX || undefined, ContinuationToken: token })
    );
    for (const obj of page.Contents ?? []) {
      const name = obj.Key.slice(storage.S3_PREFIX.length);
      if (FILENAME_RE.test(name)) names.push(name);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return names;
}

// Объекты, которые уже лежат в бакете зашифрованными приложением (их залили до перехода
// на шифрование хранилища), перезаписываются открытыми на том же ключе — адреса файлов
// не меняются. Новая версия заменяет старую разом; запрос, который в этот момент
// отдавал файл через Node, может получить испорченные байты — один раз.
async function convertBucket({ dryRun = false, concurrency = 4, log = () => {} } = {}) {
  if (!s3Ready()) throw new Error("Нужны S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY (см. .env.example)");
  if (!storage.plainConfigured) throw new Error("Перешифровка бакета выключена: файлы шифрует приложение (нет S3_SSE или S3_APP_ENCRYPTION=1)");
  if (!(await storage.verifyEncryptionAtRest())) {
    throw new Error("Перешифровка бакета отменена: у бакета нет шифрования по умолчанию (S3_SSE=bucket), открытыми файлы не пишем");
  }
  const stats = { total: 0, converted: 0, already: 0, toConvert: 0, young: 0, failed: 0, bytes: 0 };
  const names = await listBucketNames();
  stats.total = names.length;
  await runPool(
    names,
    concurrency,
    async (name) => {
      try {
        // Копия ещё на диске — её зальёт migrateUploads.
        if (fs.existsSync(path.join(UPLOAD_DIR, name))) return;
        const head = await remoteHead(name);
        if (!head) return;
        if (isPlainHead(head)) {
          stats.already += 1;
          return;
        }
        if (head.LastModified && Date.now() - new Date(head.LastModified).getTime() < MIN_AGE_MS) {
          stats.young += 1;
          return;
        }
        if (dryRun) {
          stats.toConvert += 1;
          stats.bytes += head.ContentLength ?? 0;
          return;
        }
        const started = Date.now();
        // HEAD уже сделан — заголовок читаем прямо, а все чтения привязаны к ETag: объект
        // подменили посреди работы — ошибка, а не смесь двух версий.
        const ifMatch = head.ETag;
        const tmp = await decodeToTemp({
          size: head.ContentLength ?? 0,
          header: await storage.readRemoteHeader(name, { ifMatch }),
          readRange: (start, end) => storage.readRange(name, start, end, { ifMatch }),
        });
        try {
          if (storage.deletedSince(name, started)) return;
          await uploadPlain(name, tmp);
        } finally {
          await fs.promises.unlink(tmp.path).catch(() => {});
        }
        if (await dropIfDeleted(name, started)) return;
        storage.rememberPlain(name, tmp.size);
        stats.converted += 1;
        stats.bytes += tmp.size;
      } catch (err) {
        stats.failed += 1;
        log(`✗ ${name}: ${err.message}`);
      }
    },
    log
  );
  return stats;
}

function formatBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} ГБ`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} МБ`;
  return `${Math.round(n / 1024)} КБ`;
}

function hasLocalFiles() {
  try {
    return fs.readdirSync(UPLOAD_DIR).length > 0;
  } catch {
    return false;
  }
}

function bucketNeedsConversion() {
  return storage.plainConfigured && !fs.existsSync(PLAIN_DONE_MARKER);
}

function startAutoMigration() {
  if (process.env.S3_AUTO_MIGRATE === "0" || !s3Ready()) return;
  // Снова пишем зашифрованные приложением объекты — бакет придётся перепроверить при возврате.
  if (!storage.plainConfigured) fs.rmSync(PLAIN_DONE_MARKER, { force: true });
  if (!hasLocalFiles() && !bucketNeedsConversion()) return;
  const deleteLocal = process.env.S3_MIGRATE_KEEP_LOCAL !== "1";
  const delayRaw = Number(process.env.S3_MIGRATE_DELAY_MS);
  const delay = Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : 30 * 1000;
  let running = false;
  let timer = null;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      if (hasLocalFiles()) {
        console.log("[s3] перенос вложений с диска в S3…");
        const s = await migrateUploads({ deleteLocal, concurrency: 2, log: (line) => console.log(`[s3] ${line}`) });
        console.log(
          `[s3] проход закончен: скопировано ${s.copied} (${formatBytes(s.bytes)}), уже были в S3 ${s.already}, ` +
            `убрано с диска ${s.deleted}, свежих ${s.young}, ошибок ${s.failed}`
        );
      }
      if (bucketNeedsConversion()) {
        console.log("[s3] перешифровка: объекты, зашифрованные приложением, → открытые под шифрованием хранилища…");
        const s = await convertBucket({ concurrency: 2, log: (line) => console.log(`[s3] ${line}`) });
        console.log(`[s3] перешифровка: переписано ${s.converted} (${formatBytes(s.bytes)}), уже открытые ${s.already}, свежих ${s.young}, ошибок ${s.failed}`);
        if (!s.failed && !s.young && !hasLocalFiles()) fs.writeFileSync(PLAIN_DONE_MARKER, new Date().toISOString());
      }
      if (!hasLocalFiles() && !bucketNeedsConversion()) {
        console.log("[s3] все вложения в S3 под шифрованием хранилища — перенос завершён");
        clearInterval(timer);
      }
    } catch (err) {
      console.error("[s3] перенос не удался:", err.message);
    } finally {
      running = false;
    }
  };

  setTimeout(run, delay).unref();
  timer = setInterval(run, 10 * 60 * 1000);
  timer.unref();
}

module.exports = { migrateUploads, convertBucket, startAutoMigration, formatBytes, UPLOAD_DIR };
