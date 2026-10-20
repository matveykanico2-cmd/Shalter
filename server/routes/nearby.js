const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { setNearbyLocation, clearNearbyLocation, listNearbyUsers } = require("../data/nearby");
const { getUser } = require("../data/users");

const router = express.Router();
router.use(requireUserId);

// Число или непустая числовая строка: Number("") и Number(null) дали бы 0 —
// «место 0, 0» вместо ошибки.
function coord(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const lat = coord(req.body?.lat);
    const lng = coord(req.body?.lng);
    if (!validCoords(lat, lng)) return res.status(400).json({ error: "invalid coordinates" });
    await setNearbyLocation(req.uid, lat, lng);
    const me = await getUser(req.uid);
    const users = await listNearbyUsers(req.uid, lat, lng, me?.blockedUserIds ?? []);
    res.json({ users });
  })
);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const lat = coord(req.query.lat);
    const lng = coord(req.query.lng);
    if (!validCoords(lat, lng)) return res.status(400).json({ error: "invalid coordinates" });
    const me = await getUser(req.uid);
    const users = await listNearbyUsers(req.uid, lat, lng, me?.blockedUserIds ?? []);
    res.json({ users });
  })
);

router.delete(
  "/",
  asyncRoute(async (req, res) => {
    await clearNearbyLocation(req.uid);
    res.json({ ok: true });
  })
);

module.exports = router;
