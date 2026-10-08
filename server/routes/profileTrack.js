const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser, setProfileTracks } = require("../data/users");
const { publicUser } = require("../data/sanitize");

// Музыка в профиле: несколько треков, первый — основной (как в профиле Telegram).
const MAX_TRACKS = 20;

const router = express.Router();
router.use(requireUserId);

async function currentTracks(uid) {
  return (await getUser(uid))?.profileTracks ?? [];
}

// Добавить трек (в начало — он становится основным).
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { url, name, size, mimeType, duration } = req.body ?? {};
    if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) {
      return res.status(400).json({ error: "Загрузите файл через /api/uploads и передайте полученную ссылку" });
    }
    const track = {
      url,
      name: String(name ?? "Трек").slice(0, 200),
      size: Number.isFinite(size) ? size : undefined,
      mimeType: mimeType ? String(mimeType).slice(0, 120) : undefined,
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
      at: new Date().toISOString(),
    };
    const tracks = [track, ...(await currentTracks(req.uid)).filter((t) => t.url !== url)];
    if (tracks.length > MAX_TRACKS) return res.status(400).json({ error: `Не больше ${MAX_TRACKS} треков в профиле` });
    const updated = await setProfileTracks(req.uid, tracks);
    res.json({ user: publicUser(updated) });
  })
);

// Сделать трек основным.
router.post(
  "/:index/main",
  asyncRoute(async (req, res) => {
    const tracks = await currentTracks(req.uid);
    const i = Number(req.params.index);
    if (!Number.isInteger(i) || !tracks[i]) return res.status(404).json({ error: "Трек не найден" });
    const [track] = tracks.splice(i, 1);
    const updated = await setProfileTracks(req.uid, [track, ...tracks]);
    res.json({ user: publicUser(updated) });
  })
);

// Убрать один трек.
router.delete(
  "/:index",
  asyncRoute(async (req, res) => {
    const tracks = await currentTracks(req.uid);
    const i = Number(req.params.index);
    if (!Number.isInteger(i) || !tracks[i]) return res.status(404).json({ error: "Трек не найден" });
    tracks.splice(i, 1);
    const updated = await setProfileTracks(req.uid, tracks);
    res.json({ user: publicUser(updated) });
  })
);

// Убрать все.
router.delete(
  "/",
  asyncRoute(async (req, res) => {
    const updated = await setProfileTracks(req.uid, []);
    res.json({ user: publicUser(updated) });
  })
);

module.exports = router;
