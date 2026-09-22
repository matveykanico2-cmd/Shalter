const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { setNearbyLocation, clearNearbyLocation, listNearbyUsers } = require("../data/nearby");
const { getUser } = require("../data/users");

const router = express.Router();
router.use(requireUserId);

// Делится своим (огрублённым на сервере — см. data/nearby.js) местоположением
// и в одном ответе получает список тех, кто рядом. Одним запросом, а не
// "сначала поделись, потом отдельно спроси список": иначе список неизбежно
// показывал бы то состояние базы, которое было до собственного обновления.
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: "invalid coordinates" });
    }
    await setNearbyLocation(req.uid, lat, lng);
    const me = await getUser(req.uid);
    const users = await listNearbyUsers(req.uid, lat, lng, me?.blockedUserIds ?? []);
    res.json({ users });
  })
);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "invalid coordinates" });
    const me = await getUser(req.uid);
    const users = await listNearbyUsers(req.uid, lat, lng, me?.blockedUserIds ?? []);
    res.json({ users });
  })
);

// «Больше не показывать меня» — убирает координаты, а не просто не отвечает:
// иначе последняя присланная точка молча висела бы до истечения получаса.
router.delete(
  "/",
  asyncRoute(async (req, res) => {
    await clearNearbyLocation(req.uid);
    res.json({ ok: true });
  })
);

module.exports = router;
