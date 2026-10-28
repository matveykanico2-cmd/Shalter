// Обходы по таймеру, которые остались в server/: приём донатов (DonationAlerts, DonatePay)
// и перенос вложений в S3. Остальные — в фоновом процессе Nest (apps/api, modules/background);
// он же запускает эти через startSweeps. skip — имена, которые запускать не нужно.
function startSweeps({ testMode, skip = [] }) {
  // Режим контрактных тестов: обходы не запускаются — тесты должны быть воспроизводимыми.
  // Перенос вложений в S3 тест включает явно — он проверяет сам перенос.
  if (testMode) {
    if (process.env.S3_AUTO_MIGRATE === "1") require("./uploadsMigration").startAutoMigration();
    return;
  }
  const starters = {
    "donation-alerts": () => require("./donationAlerts").startDonationAlertsSweep(),
    "donate-pay": () => require("./donatePay").startDonatePaySweep(),
    "uploads-migration": () => require("./uploadsMigration").startAutoMigration(),
  };
  for (const [name, start] of Object.entries(starters)) if (!skip.includes(name)) start();
}

// Режим контрактных тестов (packages/contract-tests/). На боевом сервере (NODE_ENV=production) флаг игнорируется.
const TEST_MODE = process.env.SHALTER_TEST_MODE === "1" && process.env.NODE_ENV !== "production";

module.exports = { startSweeps, TEST_MODE };
