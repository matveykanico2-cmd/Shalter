const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId, getOrCreateDeviceId } = require("../middleware/auth");
const { listSessions, revokeSession, revokeOtherSessions } = require("../data/sessions");

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

// Terminates one *other* device's session (see server/data/sessions.js's
// revokeSession + requireUserId's revokedAt check). Terminating your own
// current device isn't done through here — that's just logging out.
router.delete(
  "/:deviceId",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    if (req.params.deviceId === deviceId) {
      return res.status(400).json({ error: "Нельзя завершить текущий сеанс — используйте выход из аккаунта" });
    }
    await revokeSession(req.uid, req.params.deviceId);
    res.json({ ok: true });
  })
);

// "Завершить все остальные сессии" — one action for every other device at once.
router.post(
  "/terminate-others",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    await revokeOtherSessions(req.uid, deviceId);
    res.json({ ok: true });
  })
);

module.exports = router;
