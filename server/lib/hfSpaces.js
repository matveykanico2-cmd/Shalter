// Бесплатные нейросети в публичных пространствах Hugging Face (Gradio API):
// без ключа, вычисления — на стороне Hugging Face, а не нашего маленького сервера.
// С HF_TOKEN квота больше.
const { HF_TOKEN } = require("../config");

const auth = () => (HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {});

// Загрузка файла в пространство → объект FileData для аргумента функции.
async function uploadFile(base, buf, name, mime) {
  const fd = new FormData();
  fd.append("files", new Blob([buf], { type: mime }), name);
  const res = await fetch(`${base}/upload`, { method: "POST", body: fd, headers: auth(), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`upload HTTP ${res.status}`);
  const [path] = await res.json();
  return { path, meta: { _type: "gradio.FileData" }, orig_name: name, mime_type: mime };
}

// Вызов функции пространства: POST /call/<api> → event_id → поток с результатом.
async function callSpace(base, api, data, { timeoutMs = 120000 } = {}) {
  const start = await fetch(`${base}/call/${api}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(20000),
  });
  const { event_id: eventId } = await start.json().catch(() => ({}));
  if (!eventId) throw new Error(`${api}: HTTP ${start.status}`);
  const res = await fetch(`${base}/call/${api}/${eventId}`, { headers: auth(), signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (/event:\s*error/.test(text)) throw new Error(`${api}: пространство вернуло ошибку`);
  const line = text.split("\n").reverse().find((l) => l.startsWith("data:"));
  if (!line) throw new Error(`${api}: пустой ответ`);
  return JSON.parse(line.slice(5).trim());
}

const QWEN_VL = process.env.HF_VISION_SPACE || "https://ganymedenil-qwen2-vl-7b.hf.space";
const FLORENCE = "https://prithivmlmods-florence-2-image-caption.hf.space/gradio_api";

// Описание картинки по-русски (Qwen2-VL), запасной — Florence-2 (по-английски).
async function describeImageRemote(jpeg, prompt) {
  const ask =
    prompt ||
    "Опиши подробно по-русски, что на изображении: объекты, люди и их действия, цвета, место, настроение. Если есть текст — перепиши его дословно. Не выдумывай того, чего не видно.";
  try {
    const file = await uploadFile(QWEN_VL, jpeg, "image.jpg", "image/jpeg");
    const [out] = await callSpace(QWEN_VL, "run_example", [file, ask, "Qwen/Qwen2-VL-7B-Instruct"]);
    if (typeof out === "string" && out.trim().length > 10) return out.trim();
    throw new Error("qwen: пустой ответ");
  } catch (err) {
    console.warn("hf vision qwen failed:", err.message);
  }
  const file = await uploadFile(FLORENCE, jpeg, "image.jpg", "image/jpeg");
  const [out] = await callSpace(FLORENCE, "describe_image", [file, "Florence-2-large"]);
  if (typeof out === "string" && out.trim().length > 10 && !/invalid/i.test(out)) return `(описание на английском) ${out.trim()}`;
  throw new Error("распознавание изображения недоступно");
}

module.exports = { uploadFile, callSpace, describeImageRemote };
