const fs = require("fs");
const path = require("path");

// Перенос вложений с диска (data/uploads) в S3 — общий код для сервера и для
// scripts/migrate-uploads-to-s3.js.
//
// Сервер запускает его сам (startAutoMigration ниже): достаточно задать
// S3_BUCKET и ключи доступа и перезапуститься — всё, что лежит на диске,
// переедет в бакет в фоне, пока приложение работает. Пока файл не перенесён,
// lib/storage.js отдаёт его с диска, так что во время переезда ничего не
// пропадает и не отдаёт 404.
//
// Каждый файл:
// - в бакете уже есть объект того же размера — пропускается (перенос можно
//   прерывать и запускать сколько угодно раз);
// - иначе загружается как есть, байт в байт: файлы уже зашифрованы
//   (lib/fileCrypto.js), ключи остаются прежними;
// - после загрузки размер объекта в бакете сверяется с файлом на диске;
// - локальный файл удаляется (deleteLocal) только после успешной сверки.
//
// Файлы моложе минуты пропускаются — это может быть загрузка, которая ещё
// пишется; их подберёт следующий проход.
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MIN_AGE_MS = 60 * 1000;

function s3Config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) return null;
  const { S3Client } = require("@aws-sdk/client-s3");
  return {
    bucket,
    prefix: process.env.S3_PREFIX ? `${process.env.S3_PREFIX.replace(/\/+$/, "")}/` : "",
    client: new S3Client({
      region: process.env.S3_REGION || "ru-central1",
      endpoint: process.env.S3_ENDPOINT || "https://storage.yandexcloud.net",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    }),
  };
}

async function remoteSize(cfg, key) {
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const head = await cfg.client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw err;
  }
}

async function migrateOne(cfg, name, stats, { dryRun, deleteLocal }) {
  const full = path.join(UPLOAD_DIR, name);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return; // удалили, пока шли по списку
  }
  if (!stat.isFile()) return;
  if (Date.now() - stat.mtimeMs < MIN_AGE_MS) {
    stats.young += 1;
    return;
  }
  const key = cfg.prefix + name;

  let size = await remoteSize(cfg, key);
  if (size !== stat.size) {
    if (dryRun) {
      stats.toCopy += 1;
      stats.bytes += stat.size;
      return;
    }
    const { Upload } = require("@aws-sdk/lib-storage");
    await new Upload({ client: cfg.client, params: { Bucket: cfg.bucket, Key: key, Body: fs.createReadStream(full) } }).done();
    size = await remoteSize(cfg, key);
    if (size !== stat.size) throw new Error(`после загрузки размер не совпал: на диске ${stat.size}, в S3 ${size}`);
    stats.copied += 1;
    stats.bytes += stat.size;
  } else {
    stats.already += 1;
  }

  if (deleteLocal && !dryRun) {
    // Файл могли удалить из приложения, пока он ехал, — тогда его не
    // было и на диске; unlink без файла не ошибка.
    await fs.promises.unlink(full).catch(() => {});
    stats.deleted += 1;
  }
}

// Один проход по data/uploads. Возвращает счётчики; ошибки по отдельным
// файлам не прерывают проход, а считаются в failed.
async function migrateUploads({ dryRun = false, deleteLocal = false, concurrency = 4, log = () => {} } = {}) {
  const cfg = s3Config();
  if (!cfg) throw new Error("Нужны S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY (см. .env.example)");
  const stats = { total: 0, copied: 0, already: 0, toCopy: 0, young: 0, deleted: 0, failed: 0, bytes: 0 };
  if (!fs.existsSync(UPLOAD_DIR)) return stats;

  const names = fs.readdirSync(UPLOAD_DIR);
  stats.total = names.length;
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      try {
        await migrateOne(cfg, name, stats, { dryRun, deleteLocal });
      } catch (err) {
        stats.failed += 1;
        log(`✗ ${name}: ${err.message}`);
      }
      done += 1;
      if (done % 200 === 0) log(`… ${done}/${names.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
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

// Автоматический переезд при запуске сервера в режиме S3.
//
// Проходы повторяются раз в 10 минут, пока на диске что-то остаётся: так
// подбираются и «свежие» файлы, пропущенные первым проходом, и те, что не
// доехали из-за сетевой ошибки. Когда папка пуста — останавливается.
// Параллельность низкая (2), чтобы перенос не отъедал канал у живых
// пользователей.
//
// S3_AUTO_MIGRATE=0 — выключить совсем (переносить руками скриптом).
// S3_MIGRATE_KEEP_LOCAL=1 — копировать, но диск не чистить.
function startAutoMigration() {
  if (process.env.S3_AUTO_MIGRATE === "0" || !s3Config() || !hasLocalFiles()) return;
  const deleteLocal = process.env.S3_MIGRATE_KEEP_LOCAL !== "1";
  let running = false;
  let timer = null;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      console.log("[s3] перенос вложений с диска в S3…");
      const s = await migrateUploads({ deleteLocal, concurrency: 2, log: (line) => console.log(`[s3] ${line}`) });
      console.log(
        `[s3] проход закончен: скопировано ${s.copied} (${formatBytes(s.bytes)}), уже были в S3 ${s.already}, ` +
          `убрано с диска ${s.deleted}, свежих ${s.young}, ошибок ${s.failed}`
      );
      if (!hasLocalFiles()) {
        console.log("[s3] все вложения в S3, локальная папка пуста — перенос завершён");
        clearInterval(timer);
      }
    } catch (err) {
      console.error("[s3] перенос не удался:", err.message);
    } finally {
      running = false;
    }
  };

  // Не сразу при запуске — серверу есть чем заняться в первые секунды.
  setTimeout(run, 30 * 1000).unref();
  timer = setInterval(run, 10 * 60 * 1000);
  timer.unref();
}

module.exports = { migrateUploads, startAutoMigration, formatBytes, UPLOAD_DIR };
