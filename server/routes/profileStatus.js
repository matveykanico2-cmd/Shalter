const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser, getStatusState, setStatusState } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { getCatalogItem } = require("../data/profileStatuses");
const { slotsFor, validateImage } = require("../lib/profileStatus");

// A person's own status wardrobe: what they've picked from the catalog or
// uploaded, and which one (if any) is currently shown next to their name.
// Always `req.uid`'s own — same "no :id, so no permission check to get
// wrong" shape as routes/avatars.js. The read-only catalog itself is a plain
// GET /api/status-catalog in server/index.js; admin writes to it live in
// routes/admin.js.
const router = express.Router();
router.use(requireUserId);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const state = getStatusState(req.uid);
    res.json({ items: state.items, activeId: state.activeStatusId, max: slotsFor(me) });
  })
);

// Adds either a catalog pick (`catalogId`) or a custom upload (`image`, a
// data: URL the client already downscaled — see public/js/lib/image.js) to
// the account's own slots. The very first status added becomes active right
// away, since otherwise "add a status" would silently do nothing visible.
router.post(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!me) return res.status(404).json({ error: "not found" });

    const state = getStatusState(req.uid);
    const max = slotsFor(me);
    if (state.items.length >= max) {
      return res.status(409).json({
        error: max === 1 ? "Больше одного статуса не поместится — сначала удалите текущий" : `Больше ${max} статусов не поместится`,
      });
    }

    let image;
    let name;
    let catalogId;
    if (req.body?.catalogId) {
      const found = getCatalogItem(String(req.body.catalogId));
      if (!found) return res.status(404).json({ error: "Такого статуса нет в каталоге" });
      image = found.image;
      name = found.name;
      catalogId = found.id;
    } else {
      const { image: validImage, error } = validateImage(req.body?.image);
      if (error) return res.status(400).json({ error });
      image = validImage;
      name = String(req.body?.name ?? "").trim().slice(0, 40);
    }

    const entry = {
      id: `us_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      image,
      name,
      catalogId,
      addedAt: new Date().toISOString(),
    };
    const items = [...state.items, entry];
    const activeStatusId = state.activeStatusId ?? entry.id;
    const updated = await setStatusState(req.uid, items, activeStatusId);
    res.json({ user: publicUser(updated), items, activeId: activeStatusId });
  })
);

// Equips one of the account's own slots (or clears the badge with `id: null`).
router.post(
  "/me/active",
  asyncRoute(async (req, res) => {
    const state = getStatusState(req.uid);
    const id = req.body?.id ?? null;
    if (id !== null && !state.items.some((i) => i.id === id)) {
      return res.status(404).json({ error: "Статус не найден" });
    }
    const updated = await setStatusState(req.uid, state.items, id);
    res.json({ user: publicUser(updated), activeId: id });
  })
);

router.delete(
  "/me/:id",
  asyncRoute(async (req, res) => {
    const state = getStatusState(req.uid);
    const items = state.items.filter((i) => i.id !== req.params.id);
    const activeStatusId = state.activeStatusId === req.params.id ? null : state.activeStatusId;
    const updated = await setStatusState(req.uid, items, activeStatusId);
    res.json({ user: publicUser(updated), items, activeId: activeStatusId });
  })
);

module.exports = router;
