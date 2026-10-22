// Фоновый процесс: обходы по таймеру (lib/sweeps.js) и очередь обработки вложений
// (lib/backgroundJobs.js, lib/mediaJobs.js). Запускает и перезапускает его основной
// процесс (lib/workerBridge.js) — отдельно его запускать не нужно. События для
// клиентов уходят основному: сокеты только там.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", () => {});
}
require("dns").setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");

const bridge = require("./lib/workerBridge");
if (!bridge.isWorker) {
  console.error("server/worker.js запускает сам сервер (server/index.js), не напрямую");
  process.exit(1);
}

const { initPush } = require("./push");
const { startSweeps, runSweep, TEST_MODE } = require("./lib/sweeps");
const { startJobRunner } = require("./lib/backgroundJobs");
const { handlers } = require("./lib/mediaJobs");

const drain = startJobRunner(handlers);
process.on("message", (msg) => {
  if (msg?.type === "jobs") drain();
  // Служебный вызов тестов: один проход обхода (lib/sweeps.js, SWEEPS).
  else if (msg?.type === "sweep" && TEST_MODE) {
    runSweep(msg.name, new Date(msg.now)).then(
      () => bridge.reply(msg.id),
      (err) => bridge.reply(msg.id, err.message)
    );
  }
});

initPush()
  .catch((err) => console.error("[worker] push init failed:", err.message))
  .finally(() => startSweeps({ testMode: TEST_MODE }));

function shutdown() {
  try {
    require("./db").close();
  } catch {}
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", () => {}); // Ctrl+C в терминале получает вся группа — ждём SIGTERM от основного
process.on("disconnect", shutdown);
