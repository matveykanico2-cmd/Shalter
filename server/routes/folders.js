const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listFoldersFor, createFolder, getFolder, updateFolder, deleteFolder } = require("../data/folders");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const folders = await listFoldersFor(req.uid);
    res.json({ folders });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name, chatIds } = req.body ?? {};
    const folders = await listFoldersFor(req.uid);
    const folder = await createFolder({
      id: `f_${Date.now()}`,
      ownerId: req.uid,
      name,
      chatIds: chatIds ?? [],
      order: folders.length,
    });
    res.json({ folder });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await getFolder(req.params.id);
    if (!existing || existing.ownerId !== req.uid) {
      return res.status(404).json({ error: "not found" });
    }
    const folder = await updateFolder(req.params.id, req.body ?? {});
    res.json({ folder });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await getFolder(req.params.id);
    if (!existing || existing.ownerId !== req.uid) {
      return res.status(404).json({ error: "not found" });
    }
    await deleteFolder(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
