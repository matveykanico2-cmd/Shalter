const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId, getOrCreateDeviceId } = require("../middleware/auth");
const { listSessions, getSessionById, revokeSessionById, revokeOtherSessions } = require("../data/sessions");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    const sessions = await listSessions(req.uid);
    // Настоящий device_id — это секрет входа, наружу отдаём только id записи
    // (клиент по старой памяти называет его deviceId).
    res.json({ sessions: sessions.map(({ deviceId: d, ...s }) => ({ ...s, deviceId: s.id, current: d === deviceId })) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const deviceId = getOrCreateDeviceId(req, res);
    const target = await getSessionById(req.uid, req.params.id);
    if (!target) return res.status(404).json({ error: "Сеанс не найден" });
    if (target.deviceId === deviceId) {
      return res.status(400).json({ error: "Нельзя завершить текущий сеанс — используйте выход из аккаунта" });
    }
    await revokeSessionById(req.uid, target.id);
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
