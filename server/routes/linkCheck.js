// /api/link-check?url=… — можно ли открыть страницу во встроенном браузере.
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { checkFrameable } = require("../lib/linkPreview");
const { buildInstantView } = require("../lib/instantView");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const url = String(req.query.url ?? "");
    if (!/^https?:\/\//i.test(url) || url.length > 2048) return res.status(400).json({ error: "Некорректная ссылка" });
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json(await checkFrameable(url, origin));
  })
);

// /api/link-check/instant-view?url=… — статья по ссылке для режима чтения.
const ivHits = new Map();
router.get(
  "/instant-view",
  asyncRoute(async (req, res) => {
    const url = String(req.query.url ?? "");
    if (!/^https?:\/\//i.test(url) || url.length > 2048) return res.status(400).json({ error: "Некорректная ссылка" });
    const now = Date.now();
    const hits = (ivHits.get(req.uid) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 20) return res.status(429).json({ error: "Слишком часто, подождите минуту" });
    ivHits.set(req.uid, [...hits, now]);
    try {
      res.json({ view: await buildInstantView(url) });
    } catch (err) {
      res.status(err.status ?? 502).json({ error: err.status ? err.message : "Не удалось открыть статью" });
    }
  })
);

module.exports = router;
