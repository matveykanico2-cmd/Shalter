// Распознавание фото без внешних ключей: локальная нейросеть Florence-2 в
// отдельном процессе (localVisionWorker.js). Даёт английское описание картинки
// и латинский текст с неё — его получает текстовая нейросеть Shalter AI, которая
// работает без ключа. Модель (~250 МБ) скачивается в data/models при первом фото.
// LOCAL_VISION=off — выключить.
const path = require("path");
const { fork } = require("child_process");

const ENABLED = !/^(0|off|false|no)$/i.test(process.env.LOCAL_VISION || "");
const IDLE_MS = 3 * 60_000;
const TIMEOUT_MS = 4 * 60_000; // первая загрузка модели — до пары минут

let child = null;
let idleTimer = null;
let seq = 0;
const pending = new Map();
let queue = Promise.resolve();

function stop() {
  clearTimeout(idleTimer);
  if (child) child.kill();
  child = null;
}

function worker() {
  if (child) return child;
  child = fork(path.join(__dirname, "localVisionWorker.js"), [], {
    execArgv: ["--max-old-space-size=512"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  child.on("message", (m) => {
    if (m?.type !== "result") return;
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve({ caption: m.caption, ocr: m.ocr });
  });
  child.on("exit", () => {
    child = null;
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error("распознавание прервалось"));
      pending.delete(id);
    }
  });
  return child;
}

// Латинский текст с картинки полезен (вывески, скриншоты на английском), а
// кириллицу Florence-2 не читает — такой «текст» выбрасываем.
function usefulOcr(text) {
  const t = String(text ?? "").trim();
  if (t.length < 3) return "";
  const latin = (t.match(/[A-Za-z0-9]/g) ?? []).length;
  return latin / t.replace(/\s/g, "").length > 0.85 ? t.slice(0, 600) : "";
}

function describeImage(buf, { ocr = true } = {}) {
  if (!ENABLED) return Promise.reject(new Error("локальное распознавание выключено"));
  // По одной картинке за раз: модель тяжёлая, параллельные запуски только мешают.
  const run = queue.then(
    () =>
      new Promise((resolve, reject) => {
        clearTimeout(idleTimer);
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("распознавание не уложилось во время"));
          stop();
        }, TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        worker().send({ type: "describe", id, image: buf.toString("base64"), ocr });
      })
  );
  queue = run.catch(() => {}).then(() => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, IDLE_MS);
    idleTimer.unref?.();
  });
  return run.then((r) => ({ caption: r.caption, ocr: usefulOcr(r.ocr) }));
}

process.on("exit", stop);

module.exports = { describeImage, LOCAL_VISION_ENABLED: ENABLED };
