// Отдельный процесс локального распознавания картинок (Florence-2 через
// transformers.js): модель занимает ~1–2 ГБ памяти, поэтому живёт не в сервере,
// а здесь, и выгружается, когда простаивает (см. localVision.js).
const path = require("path");

let ready = null;
function load() {
  ready ??= (async () => {
    const T = require("@huggingface/transformers");
    T.env.cacheDir = process.env.LOCAL_VISION_CACHE || path.join(process.cwd(), "data", "models");
    const id = process.env.LOCAL_VISION_MODEL || "onnx-community/Florence-2-base-ft";
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

process.on("message", async (m) => {
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
