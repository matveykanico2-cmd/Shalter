const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listPacksFor, getPack, createPack, updatePack, deletePack, sanitizeStickers, MAX_STICKERS } = require("../data/stickerPacks");
const { usesForeignUpload } = require("../lib/uploadAccess");

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
    // «Хотя бы один» — после очистки: пак из одних некорректных стикеров не создаётся пустым.
    const clean = sanitizeStickers(stickers);
    if (!Array.isArray(stickers) || clean.length === 0) {
      return res.status(400).json({ error: "Добавьте хотя бы один стикер" });
    }
    if (usesForeignUpload(req.uid, clean)) return res.status(400).json({ error: "Некорректная ссылка на файл" });
    res.json({ pack: createPack({ ownerId: req.uid, name, stickers }) });
  })
);

router.patch(
  "/packs/:id",
  asyncRoute(async (req, res) => {
    const { stickers } = req.body ?? {};
    if (stickers !== undefined) {
      const current = getPack(req.params.id);
      if (!current || current.ownerId !== req.uid) return res.status(404).json({ error: "Пак не найден" });
      if (usesForeignUpload(req.uid, sanitizeStickers(stickers), current.stickers)) {
        return res.status(400).json({ error: "Некорректная ссылка на файл" });
      }
    }
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
