const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId, getOrCreateDeviceId } = require("../middleware/auth");
const { listSessions, removeSession } = require("../data/sessions");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    const sessions = await listSessions(req.uid);
    // "current" isn't stored — it's just whichever of this account's
    // sessions matches the device_id cookie on *this* request.
    res.json({ sessions: sessions.map((s) => ({ ...s, current: s.deviceId === deviceId })) });
  })
);

// Terminating a session now actually revokes it (see middleware/auth.js's
// requireUserId), so it's important this only ever targets *your own*
// sessions — without this check, any authenticated user could guess/enumerate
// another account's session id (they're just `sess_<timestamp>`) and log
// them out of their own devices.
router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const mine = await listSessions(req.uid);
    if (!mine.some((s) => s.id === req.params.id)) {
      return res.status(404).json({ error: "not found" });
    }
    await removeSession(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
