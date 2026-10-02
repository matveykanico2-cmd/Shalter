// /api/link-check?url=… — можно ли открыть страницу во встроенном браузере.
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { checkFrameable } = require("../lib/linkPreview");

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

module.exports = router;
