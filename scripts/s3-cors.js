#!/usr/bin/env node
// CORS бакета для прямой отдачи файлов: /uploads/… отвечает редиректом в бакет, и
// клиент, читающий файл через fetch (осциллограмма голосовых, просмотр текста, скачивание
// в приложении, QR-карточка с аватаром), получает его уже с домена бакета.
//   npm run s3:cors -- --origin=https://shalter.ru [--origin=https://другой.домен]
const { PutBucketCorsCommand } = require("@aws-sdk/client-s3");
const storage = require("../server/lib/storage");

const origins = process.argv
  .slice(2)
  .filter((a) => a.startsWith("--origin="))
  .map((a) => a.slice("--origin=".length).replace(/\/+$/, ""));

if (!storage.isS3Enabled || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
  console.error("Нужны S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY (см. .env.example)");
  process.exit(1);
}
if (!origins.length) {
  console.error("Укажите адрес приложения: npm run s3:cors -- --origin=https://shalter.ru");
  process.exit(1);
}

storage
  .client()
  .send(
    new PutBucketCorsCommand({
      Bucket: storage.S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["Range"],
            ExposeHeaders: ["Content-Length", "Content-Range", "Content-Type", "Accept-Ranges", "ETag"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    })
  )
  .then(() => console.log(`CORS бакета ${storage.S3_BUCKET}: ${origins.join(", ")}`))
  .catch((err) => {
    console.error("Не удалось задать CORS:", err.message);
    process.exit(1);
  });
