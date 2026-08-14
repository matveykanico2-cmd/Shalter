const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listPacksFor, getPack, createPack, updatePack, deletePack, MAX_STICKERS } = require("../data/stickerPacks");

// User-made sticker packs. The built-in set lives in the client
// (public/js/lib/stickers.js) and isn't served from here — only what people
// assemble themselves needs to persist per account.
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
    // Same 404 whether the pack doesn't exist or belongs to someone else —
    // no reason to confirm that a given id is real to a non-owner.
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
