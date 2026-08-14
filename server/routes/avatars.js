const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser, setAvatars } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { MAX_AVATARS, validateEntry } = require("../lib/avatars");

// Managing your own profile photos. Always your own: there is no :id here at
// all, so there's no permission check to get wrong — the session decides whose
// avatars these are.
//
// The file itself goes up through POST /api/uploads first (kind "avatar" or
// "avatar-video", which have their own tight ceilings); what arrives here is the
// resulting /uploads/… path plus the still to show in avatar circles.
const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    res.json({ avatars: me?.avatarImages ?? [], max: MAX_AVATARS });
  })
);

// Newest first: a freshly added photo becomes the current avatar, which is what
// "add a photo" means everywhere else and saves a second "make it the main one"
// step for the common case.
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!me) return res.status(404).json({ error: "not found" });

    const { entry, error } = validateEntry(req.body);
    if (error) return res.status(400).json({ error });

    const list = [entry, ...me.avatarImages];
    if (list.length > MAX_AVATARS) {
      return res.status(409).json({ error: `Больше ${MAX_AVATARS} аватарок не поместится — удалите одну` });
    }

    const updated = await setAvatars(req.uid, list);
    res.json({ user: publicUser(updated), avatars: updated.avatarImages });
  })
);

router.post(
  "/:index/main",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const i = Number(req.params.index);
    if (!me || !Number.isInteger(i) || i < 0 || i >= me.avatarImages.length) {
      return res.status(404).json({ error: "Аватарка не найдена" });
    }
    const list = [...me.avatarImages];
    // Moved to the front rather than swapped with whatever was first: the rest
    // keeps its order, so the list doesn't reshuffle itself under the person
    // flipping through it.
    const [picked] = list.splice(i, 1);
    const updated = await setAvatars(req.uid, [picked, ...list]);
    res.json({ user: publicUser(updated), avatars: updated.avatarImages });
  })
);

// The file on disk is deliberately left alone. It may still be referenced by a
// message someone forwarded, and an avatar is small; deleting shared uploads
// from here is how you end up with broken images in other people's chats.
router.delete(
  "/:index",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const i = Number(req.params.index);
    if (!me || !Number.isInteger(i) || i < 0 || i >= me.avatarImages.length) {
      return res.status(404).json({ error: "Аватарка не найдена" });
    }
    const list = me.avatarImages.filter((_, idx) => idx !== i);
    // Removing the current avatar promotes the next one; removing the last one
    // leaves the account on coloured initials, same as never having set one.
    const updated = await setAvatars(req.uid, list);
    res.json({ user: publicUser(updated), avatars: updated.avatarImages });
  })
);

module.exports = router;
