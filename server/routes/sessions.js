const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listSessions, removeSession } = require("../data/sessions");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const sessions = await listSessions(req.uid);
    res.json({ sessions });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    await removeSession(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
