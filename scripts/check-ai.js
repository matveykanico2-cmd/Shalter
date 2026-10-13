// Проверка нейросетей Shalter AI прямо на сервере: текст, фото, речь, рисование.
//   node --env-file-if-exists=config.env scripts/check-ai.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

async function step(name, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`✅ ${name} — ${Date.now() - t} мс: ${String(out).slice(0, 160).replace(/\s+/g, " ")}`);
  } catch (err) {
    console.log(`❌ ${name} — ${err.message}`);
  }
}

(async () => {
  console.log(`Память сервера: ${(require("os").totalmem() / 1024 ** 3).toFixed(1)} ГБ, ядер: ${require("os").cpus().length}\n`);
  const ai = require(path.join(root, "server/lib/shalterAi"));
  const { describeImageRemote } = require(path.join(root, "server/lib/hfSpaces"));
  const { transcribeFile, LOCAL_VISION_ENABLED, LOCAL_ASR_ENABLED } = require(path.join(root, "server/lib/localVision"));
  console.log(`Локальная модель для фото: ${LOCAL_VISION_ENABLED ? "включена" : "выключена (мало памяти — фото через Hugging Face)"}; речь: ${LOCAL_ASR_ENABLED ? "включена" : "выключена"}\n`);

  await step("Текст (бесплатная нейросеть)", () => ai.generate([{ role: "user", content: "Ответь одним словом: столица России?", media: [] }]));
  const sharp = require("sharp");
  const jpeg = await sharp(path.join(root, "public/img/bots/shalter-crab.webp")).jpeg().toBuffer();
  await step("Фото (Qwen2-VL на Hugging Face)", () => describeImageRemote(jpeg));
  await step("Рисование (FLUX на Hugging Face)", async () => `${(await ai.renderImage("a small red apple on a white table")).length} байт картинки`);
  try {
    require.resolve("@huggingface/transformers");
  } catch {
    console.log("❌ Речь — не установлен пакет @huggingface/transformers: выполните npm install");
    process.exit(0);
  }
  const wav = ["/usr/share/sounds/alsa/Front_Center.wav"].find((f) => fs.existsSync(f));
  if (wav) await step("Речь (локальный Whisper; первый раз скачивает модель)", () => transcribeFile(wav));
  else console.log("… Речь — нет тестового звука на сервере, пропускаю");
  process.exit(0);
})();
