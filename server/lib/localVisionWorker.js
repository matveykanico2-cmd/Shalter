// Отдельный процесс локального распознавания картинок (Florence-2 через
// transformers.js): модель занимает ~1–2 ГБ памяти, поэтому живёт не в сервере,
// а здесь, и выгружается, когда простаивает (см. localVision.js).
const path = require("path");

let ready = null;
function load() {
  ready ??= (async () => {
    const T = require("@huggingface/transformers");
    T.env.cacheDir = process.env.LOCAL_VISION_CACHE || path.join(process.cwd(), "data", "models");
    // Большая модель описывает фото заметно точнее, но ей нужно ~3,5 ГБ памяти —
    // берём её, если на сервере от 6 ГБ; иначе лёгкую (~1,5 ГБ).
    const big = require("os").totalmem() >= 6 * 1024 ** 3;
    const id = process.env.LOCAL_VISION_MODEL || (big ? "onnx-community/Florence-2-large-ft" : "onnx-community/Florence-2-base-ft");
    const model = await T.Florence2ForConditionalGeneration.from_pretrained(id, { dtype: "q8" });
    const processor = await T.AutoProcessor.from_pretrained(id);
    return { T, model, processor };
  })();
  return ready;
}

async function run(task, image, { model, processor }) {
  const inputs = await processor(image, processor.construct_prompts(task));
  const ids = await model.generate({ ...inputs, max_new_tokens: 160 });
  const raw = processor.batch_decode(ids, { skip_special_tokens: false })[0];
  return String(processor.post_process_generation(raw, task, image.size)?.[task] ?? "").trim();
}

// Распознавание речи (голосовые, кружки, видео): Whisper, понимает русский.
let asr = null;
function loadAsr() {
  asr ??= (async () => {
    const T = require("@huggingface/transformers");
    T.env.cacheDir = process.env.LOCAL_VISION_CACHE || path.join(process.cwd(), "data", "models");
    return T.pipeline("automatic-speech-recognition", process.env.LOCAL_ASR_MODEL || "Xenova/whisper-small", { dtype: "q8" });
  })();
  return asr;
}

process.on("message", async (m) => {
  if (m?.type === "transcribe") {
    try {
      const run = await loadAsr();
      const raw = Buffer.from(m.pcm, "base64");
      const audio = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
      const out = await run(audio, { language: m.language || "russian", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
      process.send({ type: "result", id: m.id, text: String(out?.text ?? "").trim() });
    } catch (err) {
      process.send({ type: "result", id: m.id, error: err?.message || String(err) });
    }
    return;
  }
  if (m?.type !== "describe") return;
  try {
    const ctx = await load();
    const image = await ctx.T.RawImage.fromBlob(new Blob([Buffer.from(m.image, "base64")]));
    const caption = await run("<MORE_DETAILED_CAPTION>", image, ctx);
    const ocr = m.ocr ? await run("<OCR>", image, ctx) : "";
    process.send({ type: "result", id: m.id, caption, ocr });
  } catch (err) {
    process.send({ type: "result", id: m.id, error: err?.message || String(err) });
  }
});
process.send({ type: "up" });
