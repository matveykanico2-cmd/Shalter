// Всё, что живёт рядом с HTTP-сервером Nest (apps/api, main.ts): события старого кода
// для шлюза WebSocket, фоновый процесс, RTMP, push, проверка бакета, остановка по сигналу.
// Слушать порт начинает переданная функция listen, когда всё готово.
// opts.realtime — шлюз WebSocket Nest: события старого кода уходят в него (ws.js).
// opts.workerEntry — фоновый процесс Nest (apps/api/dist/worker.js); при BACKGROUND_WORKER=0
// очередь и обходы запускает сам main.ts. Отложенные сообщения отправляет Nest (modules/messages).
const { useRealtime } = require("./ws");
const { initPush } = require("./push");
const { TEST_MODE } = require("./lib/sweeps");
const workerBridge = require("./lib/workerBridge");

function startRuntime(server, listen, opts = {}) {
  useRealtime(opts.realtime);

  // Обходы по таймеру и обработка вложений — в фоновом процессе; в режиме тестов
  // (SHALTER_TEST_MODE) он обходы не запускает. RTMP — всегда здесь; в режиме тестов
  // его нет: параллельные серверы не должны делить порт RTMP.
  if (workerBridge.enabled) workerBridge.startWorker(opts.workerEntry);
  if (TEST_MODE) {
    console.log("[test] SHALTER_TEST_MODE: фоновые обходы и RTMP выключены");
  } else {
    startRtmp();
  }

  function shutdown() {
    console.log("shutting down…");
    server.close(async () => {
      await workerBridge.stopWorker();
      // Сливаем WAL в app.db и закрываем базу: иначе после каждой остановки
      // последние записи остаются только в app.db-wal.
      try {
        const db = require("./db");
        db.pragma("wal_checkpoint(TRUNCATE)");
        db.close();
      } catch (err) {
        console.error("db close failed:", err.message);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return Promise.all([
    initPush().catch((err) => console.error("push init failed, push notifications disabled:", err)),
    checkBucketEncryption(),
  ]).finally(() => listen(process.env.PORT || 3000));
}

function startRtmp() {
  try {
    const rtmp = require("./rtmp");
    const { broadcastToUsers } = require("./ws");
    const { getChat } = require("./data/chats");
    rtmp.start({
      onStreamChange: async (stream) => {
        const chat = await getChat(stream.chatId).catch(() => null);
        if (!chat) return;
        broadcastToUsers(chat.memberIds, { type: "live:state", streamId: stream.id });
      },
    });
    console.log(`[rtmp] поднимаем приём эфиров из OBS на rtmp://0.0.0.0:${rtmp.RTMP_PORT}/live`);
  } catch (err) {
    console.error("[rtmp] не поднялся, вещание из OBS недоступно:", err.message);
  }
}

// S3_SSE=bucket: до первого запроса узнаём у бакета, шифрует ли он сам (иначе файлы
// шифрует приложение); не ответил за 5 с — проверка повторится позже.
function checkBucketEncryption() {
  const storage = require("./lib/storage");
  if (!storage.plainConfigured || storage.storesPlain) return Promise.resolve();
  const timer = setInterval(() => {
    if (storage.storesPlain) return clearInterval(timer);
    storage.verifyEncryptionAtRest().catch(() => {});
  }, 10 * 60 * 1000);
  timer.unref();
  return Promise.race([storage.verifyEncryptionAtRest().catch(() => {}), new Promise((r) => setTimeout(r, 5000).unref())]);
}

module.exports = { startRuntime };
