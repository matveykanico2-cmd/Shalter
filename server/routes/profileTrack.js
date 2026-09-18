const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { setProfileTrack } = require("../data/users");
const { publicUser } = require("../data/sanitize");

// The one pinned track on your own profile — always your own, same "no :id,
// session decides" shape as routes/avatars.js. The file itself goes up
// through POST /api/uploads first (kind "profile-track"); what arrives here
// is just the resulting /uploads/… path plus display fields.
const router = express.Router();
router.use(requireUserId);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { url, name, size, mimeType } = req.body ?? {};
    if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) {
      return res.status(400).json({ error: "Загрузите файл через /api/uploads и передайте полученную ссылку" });
    }
    const track = {
      url,
      name: String(name ?? "Трек").slice(0, 200),
      size: Number.isFinite(size) ? size : undefined,
      mimeType: mimeType ? String(mimeType).slice(0, 120) : undefined,
      at: new Date().toISOString(),
    };
    const updated = await setProfileTrack(req.uid, track);
    res.json({ user: publicUser(updated) });
  })
);

router.delete(
  "/",
  asyncRoute(async (req, res) => {
    const updated = await setProfileTrack(req.uid, null);
    res.json({ user: publicUser(updated) });
  })
);

module.exports = router;
