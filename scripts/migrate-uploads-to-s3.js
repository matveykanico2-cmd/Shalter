#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { migrateUploads, convertBucket, formatBytes } = require("../server/lib/uploadsMigration");
const storage = require("../server/lib/storage");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const deleteLocal = argv.includes("--delete-local");
const concurrency = Number(argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1]) || 4;

if (!process.env.UPLOADS_KEY && fs.existsSync(path.join(process.cwd(), "data", "uploads.key"))) {
  console.warn(
    storage.plainConfigured
      ? "Внимание: ключ файлов лежит в data/uploads.key. Он нужен, чтобы расшифровать старые файлы при переносе — не удаляйте его до конца переезда.\n"
      : "Внимание: ключ файлов лежит в data/uploads.key. Файлы в S3 зашифрованы им — не потеряйте его при переезде.\n"
  );
}

async function main() {
  let failed = 0;
  const s = await migrateUploads({ dryRun, deleteLocal, concurrency, log: console.log });
  failed += s.failed;
  console.log(
    dryRun
      ? `С диска: файлов ${s.total}. Нужно скопировать: ${s.toCopy} (${formatBytes(s.bytes)}), уже в S3: ${s.already}, слишком свежих: ${s.young}`
      : `С диска: файлов ${s.total}. Скопировано: ${s.copied} (${formatBytes(s.bytes)}), уже были в S3: ${s.already}, ` +
          `удалено с диска: ${s.deleted}, пропущено свежих: ${s.young}, ошибок: ${s.failed}`
  );
  // Шифрование на стороне хранилища: объекты, которые уже в бакете, но зашифрованы
  // приложением, переписываются открытыми.
  // С S3_SSE=bucket и бакетом без шифрования convertBucket откажется — и скрипт
  // завершится с ошибкой, а не молча.
  if (storage.plainConfigured) {
    const b = await convertBucket({ dryRun, concurrency, log: console.log });
    failed += b.failed;
    console.log(
      dryRun
        ? `В бакете: объектов ${b.total}. Нужно перешифровать: ${b.toConvert} (${formatBytes(b.bytes)}), уже открытые: ${b.already}, свежих: ${b.young}`
        : `В бакете: объектов ${b.total}. Перешифровано: ${b.converted} (${formatBytes(b.bytes)}), уже открытые: ${b.already}, ` +
            `пропущено свежих: ${b.young}, ошибок: ${b.failed}`
    );
  }
  if (failed) {
    console.error("Были ошибки — запустите ещё раз: обработается только недостающее.");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Перенос прерван:", err.message);
  process.exit(1);
});
