const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listPacksFor, getPack, createPack, updatePack, deletePack, MAX_STICKERS } = require("../data/stickerPacks");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/packs",
  asyncRoute(async (req, res) => {
    res.json({ packs: listPacksFor(req.uid), maxStickers: MAX_STICKERS });
  })
);

router.post(
  "/packs",
  asyncRoute(async (req, res) => {
    const { name, stickers } = req.body ?? {};
    if (!String(name ?? "").trim()) return res.status(400).json({ error: "Назовите пак" });
    if (!Array.isArray(stickers) || stickers.length === 0) {
      return res.status(400).json({ error: "Добавьте хотя бы один стикер" });
    }
    res.json({ pack: createPack({ ownerId: req.uid, name, stickers }) });
  })
);

router.patch(
  "/packs/:id",
  asyncRoute(async (req, res) => {
    const pack = updatePack(req.params.id, req.uid, req.body ?? {});
    if (!pack) return res.status(404).json({ error: "Пак не найден" });
    res.json({ pack });
  })
);

router.delete(
  "/packs/:id",
  asyncRoute(async (req, res) => {
    if (!deletePack(req.params.id, req.uid)) return res.status(404).json({ error: "Пак не найден" });
    res.json({ ok: true });
  })
);

module.exports = router;
