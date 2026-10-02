const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("../lib/unsupportedLanguages");
const { getCachedTranslations, saveTranslations } = require("../data/translationCache");

const router = express.Router();
router.use(requireUserId);

async function translateOne(text, target, source = "auto") {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t` +
    `&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`;
  const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!upstream.ok) throw new Error(`upstream responded ${upstream.status}`);
  const data = await upstream.json();
  return { translated: (data?.[0] ?? []).map((chunk) => chunk?.[0] ?? "").join(""), detectedLang: data?.[2] ?? null };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { text, target } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: "Нечего переводить" });
    if (!target?.trim()) return res.status(400).json({ error: "Не указан язык перевода" });
    if (isUnsupportedLanguage(target)) return res.status(400).json({ error: UNSUPPORTED_MESSAGE });

    try {
      const result = await translateOne(text, target);
      res.json(result);
    } catch (err) {
      console.error("translate upstream failed:", err);
      res.status(502).json({ error: "Сервис перевода сейчас недоступен, попробуйте позже" });
    }
  })
);

// Сколько URL-кодированного текста влезает в один GET к Google (лимит URL ~16 КБ).
const CHUNK_ENCODED_LIMIT = 6000;

// Переводит пачку строк одним запросом: склеиваем через перевод строки и режем
// ответ обратно. Если Google склеил или разбил строки — переводим эту пачку по одной.
async function translateChunk(texts, target) {
  if (texts.length > 1) {
    try {
      const { translated } = await translateOne(texts.join("\n"), target, "ru");
      const lines = translated.split("\n").map((l) => l.trim());
      if (lines.length === texts.length && lines.every(Boolean)) return lines;
    } catch (err) {
      console.error("batch translate chunk failed:", err);
    }
  }
  return mapWithConcurrency(texts, 4, async (text) => {
    try {
      return (await translateOne(text, target, "ru")).translated.trim() || null;
    } catch (err) {
      console.error("batch translate item failed:", err);
      return null;
    }
  });
}

function splitIntoChunks(texts) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const text of texts) {
    const len = encodeURIComponent(text).length + 3;
    // Многострочные строки идут отдельно — их нельзя склеивать через \n.
    if (text.includes("\n")) {
      chunks.push([text]);
      continue;
    }
    if (current.length && size + len > CHUNK_ENCODED_LIMIT) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

router.post(
  "/batch",
  asyncRoute(async (req, res) => {
    const { texts, target } = req.body ?? {};
    if (!Array.isArray(texts) || texts.length === 0) return res.status(400).json({ error: "texts must be a non-empty array" });
    if (!target?.trim()) return res.status(400).json({ error: "Не указан язык перевода" });
    if (isUnsupportedLanguage(target)) return res.status(400).json({ error: UNSUPPORTED_MESSAGE });
    if (texts.length > 300) return res.status(400).json({ error: "Слишком много строк за один запрос (максимум 300)" });

    const lang = target.trim().toLowerCase();
    const capped = texts.map((t) => String(t ?? "").trim().slice(0, 2000));
    const known = getCachedTranslations(lang, [...new Set(capped.filter(Boolean))]);
    const missing = [...new Set(capped.filter((t) => t && !known.has(t)))];

    if (missing.length) {
      const chunks = splitIntoChunks(missing);
      const results = await mapWithConcurrency(chunks, 4, (chunk) => translateChunk(chunk, lang));
      const fresh = [];
      chunks.forEach((chunk, ci) =>
        chunk.forEach((text, i) => {
          const translated = results[ci][i];
          if (!translated) return;
          known.set(text, translated);
          fresh.push([text, translated]);
        })
      );
      saveTranslations(lang, fresh);
    }

    res.json({ translations: capped.map((t) => (t ? known.get(t) ?? null : t)) });
  })
);

module.exports = router;
