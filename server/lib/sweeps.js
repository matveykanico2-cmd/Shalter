// Обходы по таймеру, которые идут в фоновом процессе (server/worker.js), а при
// BACKGROUND_WORKER=0 — в основном. Отложенные сообщения (scheduledMessagesSweep)
// остаются в основном процессе: они проходят весь путь отправки, а у ботов и
// Shalter AI есть состояние в памяти основного процесса (например, «остановить ответ»).
function startSweeps({ testMode }) {
  // Режим контрактных тестов: обходы не запускаются — тесты должны быть воспроизводимыми.
  // Перенос вложений в S3 тест включает явно — он проверяет сам перенос.
  if (testMode) {
    if (process.env.S3_AUTO_MIGRATE === "1") require("./uploadsMigration").startAutoMigration();
    return;
  }
  require("./autoDelete").startAutoDeleteSweep();
  require("./donationAlerts").startDonationAlertsSweep();
  require("./donatePay").startDonatePaySweep();
  require("./birthdaySweep").startBirthdaySweep();
  require("./holidaySweep").startHolidaySweep();
  require("./reminderSweep").startReminderSweep();
  require("./accountDeletionSweep").startAccountDeletionSweep();
  require("./orphanSweep").startOrphanSweep();
  require("./uploadsMigration").startAutoMigration();
}

// Режим контрактных тестов (tests/). На боевом сервере (NODE_ENV=production) флаг игнорируется.
const TEST_MODE = process.env.SHALTER_TEST_MODE === "1" && process.env.NODE_ENV !== "production";

module.exports = { startSweeps, TEST_MODE };
