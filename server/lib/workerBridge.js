// Связь основного процесса с фоновым (server/worker.js). Основной отвечает на запросы и
// держит сокеты; фоновый делает обходы по таймеру и обработку вложений. Сокеты есть
// только в основном, поэтому события для клиентов и отзыв доступа фоновый процесс
// передаёт сюда по IPC, а основной будит фоновый, когда в очереди появилась задача.
//
// BACKGROUND_WORKER=0 — всё по-старому, в одном процессе (на случай проблем с фоновым).
const path = require("path");
const { fork } = require("child_process");

const isWorker = process.env.SHALTER_ROLE === "worker" && typeof process.send === "function";
const enabled = process.env.BACKGROUND_WORKER !== "0";
// Куча фонового процесса: обходам и очереди хватает немного, sharp и ffmpeg держат
// память вне кучи (на 2 ГБ: 768 МБ основной + это + nginx и система).
const HEAP_MB = Number(process.env.WORKER_MAX_OLD_SPACE_MB) || 256;

let child = null;
let stopping = false;
let restartDelay = 1000;
const handlers = new Map();
let onWake = null;

// --- в фоновом процессе ---

function toMain(type, data) {
  if (!isWorker || !process.connected) return;
  try {
    process.send({ type, ...data });
  } catch (err) {
    console.error(`[worker] не передать ${type} основному процессу:`, err.message);
  }
}

// --- в основном процессе ---

function on(type, fn) {
  handlers.set(type, fn);
}

function startWorker() {
  if (child || stopping) return;
  const execArgv = process.execArgv.filter((a) => !a.startsWith("--max-old-space-size") && !a.startsWith("--inspect"));
  const started = Date.now();
  child = fork(path.join(__dirname, "..", "worker.js"), [], {
    env: { ...process.env, SHALTER_ROLE: "worker" },
    execArgv: [...execArgv, `--max-old-space-size=${HEAP_MB}`],
    serialization: "advanced",
  });
  console.log(`[worker] фоновый процесс запущен (pid ${child.pid})`);
  child.on("message", (msg) => {
    const fn = handlers.get(msg?.type);
    if (!fn) return;
    try {
      fn(msg);
    } catch (err) {
      console.error(`[worker] ошибка обработки ${msg.type}:`, err);
    }
  });
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    // Прожил дольше минуты — падение разовое, перезапускаем сразу; иначе всё реже.
    restartDelay = Date.now() - started > 60_000 ? 1000 : Math.min(restartDelay * 2, 60_000);
    console.error(`[worker] фоновый процесс завершился (${signal ?? code}), перезапуск через ${restartDelay / 1000} с`);
    setTimeout(startWorker, restartDelay).unref();
  });
}

function wakeWorker() {
  if (child?.connected) {
    try {
      child.send({ type: "jobs" });
    } catch {}
  } else if (!enabled && onWake) onWake();
}

function stopWorker() {
  stopping = true;
  if (!child) return Promise.resolve();
  const proc = child;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve();
    }, 2500);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill("SIGTERM");
  });
}

// Без фонового процесса очередь разбирает основной — его runner подписывается сюда.
function onJobsQueued(fn) {
  onWake = fn;
}

module.exports = { isWorker, enabled, toMain, on, startWorker, stopWorker, wakeWorker, onJobsQueued };
