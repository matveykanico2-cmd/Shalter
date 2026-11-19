const { HeadBucketCommand } = require("@aws-sdk/client-s3");
const storage = require("../server/lib/storage");

async function main() {
  if (!storage.isS3Enabled) throw new Error("S3_BUCKET не задан: сначала настройте S3-хранилище");
  const s3 = storage.client();
  await s3.send(new HeadBucketCommand({ Bucket: storage.S3_BUCKET }));
  const versioning = await storage.ensureBucketVersioning();
  console.log(JSON.stringify({
    ok: true,
    bucket: storage.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT || "https://storage.yandexcloud.net",
    versioning: versioning ? "enabled" : "not-enabled",
    message: versioning ? "Объекты доступны для восстановления после удаления" : "Включите S3_ENABLE_VERSIONING=1 для защиты версий",
  }, null, 2));
}

main().catch((err) => {
  console.error(`[s3] проверка не пройдена: ${err.message}`);
  process.exitCode = 1;
});
