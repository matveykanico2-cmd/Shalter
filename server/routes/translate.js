const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");

const router = express.Router();
router.use(requireUserId);

// No paid translation API in this project (see AGENTS.md — plain self-hosted
// app, no external service budget) — this calls the same free, no-API-key
// Google Translate web endpoint many open-source translation tools use.
// It's unofficial (no SLA, could change/rate-limit without notice), but it's
// a real machine translator across 100+ languages at zero cost, which is the
// actual tradeoff here rather than standing up a self-hosted ML model on a
// 2-core/2GB box (see DEPLOY.md).
//
// Shared by both routes below: single-message translation (source language
// unknown — "auto") and the UI-translation batch endpoint (source is always
// Russian, since that's what every label in this app is authored in).
async function translateOne(text, target, source = "auto") {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t` +
    `&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`;
  const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!upstream.ok) throw new Error(`upstream responded ${upstream.status}`);
  const data = await upstream.json();
  // Response shape: [[[translatedChunk, originalChunk, ...], ...], null, detectedSourceLang, ...]
  // Long text comes back split into sentence-ish chunks — stitch them back together.
  return { translated: (data?.[0] ?? []).map((chunk) => chunk?.[0] ?? "").join(""), detectedLang: data?.[2] ?? null };
}

// Bounded-concurrency map so a big batch (e.g. every label on a settings
// page) doesn't fire 100 simultaneous outbound requests at once — polite to
// the free upstream endpoint, and avoids this server's own outbound
// connection pool getting hammered by one page's worth of UI text.
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

    try {
      const result = await translateOne(text, target);
      res.json(result);
    } catch (err) {
      console.error("translate upstream failed:", err);
      res.status(502).json({ error: "Сервис перевода сейчас недоступен, попробуйте позже" });
    }
  })
);

// Powers UI translation (public/js/lib/uiTranslate.js) — translating the
// app's own interface text (buttons, labels, placeholders), not message
// content. One request for a whole page's worth of strings instead of one
// round trip per label.
router.post(
  "/batch",
  asyncRoute(async (req, res) => {
    const { texts, target } = req.body ?? {};
    if (!Array.isArray(texts) || texts.length === 0) return res.status(400).json({ error: "texts must be a non-empty array" });
    if (!target?.trim()) return res.status(400).json({ error: "Не указан язык перевода" });
    if (texts.length > 200) return res.status(400).json({ error: "Слишком много строк за один запрос (максимум 200)" });

    const capped = texts.map((t) => String(t ?? "").slice(0, 500));
    const translations = await mapWithConcurrency(capped, 5, async (text) => {
      if (!text.trim()) return text;
      try {
        return (await translateOne(text, target, "ru")).translated;
      } catch (err) {
        console.error("batch translate item failed:", err);
        return text; // fall back to the original rather than failing the whole batch
      }
    });
    res.json({ translations });
  })
);

module.exports = router;
