const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("../lib/unsupportedLanguages");

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

router.post(
  "/batch",
  asyncRoute(async (req, res) => {
    const { texts, target } = req.body ?? {};
    if (!Array.isArray(texts) || texts.length === 0) return res.status(400).json({ error: "texts must be a non-empty array" });
    if (!target?.trim()) return res.status(400).json({ error: "Не указан язык перевода" });
    if (isUnsupportedLanguage(target)) return res.status(400).json({ error: UNSUPPORTED_MESSAGE });
    if (texts.length > 200) return res.status(400).json({ error: "Слишком много строк за один запрос (максимум 200)" });

    const capped = texts.map((t) => String(t ?? "").slice(0, 500));
    const translations = await mapWithConcurrency(capped, 5, async (text) => {
      if (!text.trim()) return text;
      try {
        return (await translateOne(text, target, "ru")).translated;
      } catch (err) {
        console.error("batch translate item failed:", err);
        return null;
      }
    });
    res.json({ translations });
  })
);

module.exports = router;
