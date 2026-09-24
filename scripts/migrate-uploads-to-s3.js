#!/usr/bin/env node
// Ручной перенос вложений с диска в S3. Обычно он не нужен: сервер с
// заданным S3_BUCKET переносит всё сам при запуске (server/lib/
// uploadsMigration.js). Скрипт — для тех, кто хочет посмотреть заранее
// (--dry-run), перенести быстрее (--concurrency=8) или сделать это до
// переключения сервера.
//
//   npm run uploads:to-s3 -- [--dry-run] [--delete-local] [--concurrency=8]
const fs = require("fs");
const path = require("path");
const { migrateUploads, formatBytes } = require("../server/lib/uploadsMigration");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const deleteLocal = argv.includes("--delete-local");
const concurrency = Number(argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1]) || 4;

if (!process.env.UPLOADS_KEY && fs.existsSync(path.join(process.cwd(), "data", "uploads.key"))) {
  console.warn("Внимание: ключ файлов лежит в data/uploads.key. Файлы в S3 зашифрованы им — не потеряйте его при переезде.\n");
}

migrateUploads({ dryRun, deleteLocal, concurrency, log: console.log })
  .then((s) => {
    console.log(
      dryRun
        ? `Файлов: ${s.total}. Нужно скопировать: ${s.toCopy} (${formatBytes(s.bytes)}), уже в S3: ${s.already}, слишком свежих: ${s.young}`
        : `Файлов: ${s.total}. Скопировано: ${s.copied} (${formatBytes(s.bytes)}), уже были в S3: ${s.already}, ` +
            `удалено с диска: ${s.deleted}, пропущено свежих: ${s.young}, ошибок: ${s.failed}`
    );
    if (s.failed) {
      console.error("Были ошибки — запустите ещё раз: докопируется только недостающее.");
      process.exit(2);
    }
  })
  .catch((err) => {
    console.error("Перенос прерван:", err.message);
    process.exit(1);
  });
