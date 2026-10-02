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
    res.json({ sessions: sessions.map((s) => ({ ...s, current: s.deviceId === deviceId })) });
  })
);

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

router.post(
  "/terminate-others",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    await revokeOtherSessions(req.uid, deviceId);
    res.json({ ok: true });
  })
);

module.exports = router;
