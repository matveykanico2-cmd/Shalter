const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId, getOrCreateDeviceId } = require("../middleware/auth");
const { listSessions } = require("../data/sessions");

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

module.exports = router;
