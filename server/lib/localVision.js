// Распознавание фото без внешних ключей: локальная нейросеть Florence-2 в
// отдельном процессе (localVisionWorker.js). Даёт английское описание картинки
// и латинский текст с неё — его получает текстовая нейросеть Shalter AI, которая
// работает без ключа. Модель (~250 МБ) скачивается в data/models при первом фото.
// LOCAL_VISION=off — выключить.
const path = require("path");
const { fork } = require("child_process");

// На маленьком сервере (2 ГБ) тяжёлая модель для фото загоняла систему в своп и
// тормозил весь мессенджер. Фото там распознаёт Hugging Face (lib/hfSpaces.js), а
// локально — только речь лёгкой моделью. Локальные фото — при RAM ≥ 6 ГБ или LOCAL_VISION=on.
const BIG_BOX = require("os").totalmem() >= 6 * 1024 ** 3;
const OFF = /^(0|off|false|no)$/i.test(process.env.LOCAL_VISION || "");
const ENABLED = !OFF && (BIG_BOX || /^(1|on|true|yes)$/i.test(process.env.LOCAL_VISION || ""));
const ASR_ENABLED = !OFF;
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
    env: { ...process.env, LOCAL_AI_THREADS: String(BIG_BOX ? Math.max(1, Math.floor(require("os").cpus().length / 2)) : 1) },
  });
  // Самый низкий приоритет: распознавание не должно отнимать процессор у мессенджера.
  try {
    require("os").setPriority(child.pid, 19);
  } catch {}
  child.on("message", (m) => {
    if (m?.type !== "result") return;
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve({ caption: m.caption, ocr: m.ocr, text: m.text });
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
  // Чтение текста придумывает надписи там, где их нет, — верим ему, только если
  // в описании картинки сама модель увидела текст, табличку, экран или документ.
  const mentionsText = (c) => /\b(text|word|words|written|writing|sign|letter|letters|logo|label|title|screen|document|page|poster|banner|caption|menu|note|book)\b/i.test(c ?? "");
  return run.then((r) => ({ caption: r.caption, ocr: mentionsText(r.caption) ? usefulOcr(r.ocr) : "" }));
}

// Звук из файла (голосовое, кружок, видео) → PCM 16 кГц моно float32 через ffmpeg.
function decodeAudio(filePath, maxSec = 180) {
  const { spawn } = require("child_process");
  const { ffmpegPath } = require("./ffmpegBinary");
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, ["-v", "error", "-i", filePath, "-t", String(maxSec), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"]);
    const chunks = [];
    let err = "";
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => (err += c));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err.trim().slice(0, 200) || `ffmpeg ${code}`))));
  });
}

// Текст речи из аудио/видео файла. Пустая строка — речи нет.
async function transcribeFile(filePath) {
  if (!ASR_ENABLED) throw new Error("локальное распознавание выключено");
  const pcm = await decodeAudio(filePath);
  if (pcm.length < 16000 * 4 * 0.3) return ""; // короче 0,3 с — нечего распознавать
  const run = queue.then(
    () =>
      new Promise((resolve, reject) => {
        clearTimeout(idleTimer);
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("распознавание речи не уложилось во время"));
          stop();
        }, TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        worker().send({ type: "transcribe", id, pcm: pcm.toString("base64") });
      })
  );
  queue = run.catch(() => {}).then(() => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, IDLE_MS);
    idleTimer.unref?.();
  });
  return (await run).text ?? "";
}

process.on("exit", stop);

module.exports = { describeImage, transcribeFile, LOCAL_VISION_ENABLED: ENABLED, LOCAL_ASR_ENABLED: ASR_ENABLED, BIG_BOX };
