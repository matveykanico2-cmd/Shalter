const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser, setAvatars } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { MAX_AVATARS, validateEntry } = require("../lib/avatars");
const { notifyProfileChanged } = require("../lib/notifyProfileChanged");

const router = express.Router();
router.use(requireUserId);

function avatarList(me) {
  const list = me?.avatarImages ?? [];
  if (list.length || !me?.avatarImage) return list;
  return [{ url: me.avatarImage, kind: "image", poster: me.avatarImage }];
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    res.json({ avatars: avatarList(me), max: MAX_AVATARS });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!me) return res.status(404).json({ error: "not found" });

    const { entry, error } = validateEntry(req.body);
    if (error) return res.status(400).json({ error });

    const list = [entry, ...avatarList(me)];
    if (list.length > MAX_AVATARS) {
      return res.status(409).json({ error: `Больше ${MAX_AVATARS} аватарок не поместится — удалите одну` });
    }

    const updated = await setAvatars(req.uid, list);
    notifyProfileChanged(req.uid, updated);
    res.json({ user: publicUser(updated), avatars: updated.avatarImages });
  })
);

router.post(
  "/:index/main",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const i = Number(req.params.index);
    if (!me || !Number.isInteger(i) || i < 0 || i >= avatarList(me).length) {
      return res.status(404).json({ error: "Аватарка не найдена" });
    }
    const list = [...avatarList(me)];
    const [picked] = list.splice(i, 1);
    const updated = await setAvatars(req.uid, [picked, ...list]);
    notifyProfileChanged(req.uid, updated);
    res.json({ user: publicUser(updated), avatars: updated.avatarImages });
  })
);

router.delete(
  "/:index",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const i = Number(req.params.index);
    if (!me || !Number.isInteger(i) || i < 0 || i >= avatarList(me).length) {
      return res.status(404).json({ error: "Аватарка не найдена" });
    }
    const list = avatarList(me).filter((_, idx) => idx !== i);
    const updated = await setAvatars(req.uid, list);
    notifyProfileChanged(req.uid, updated);
    res.json({ user: publicUser(updated), avatars: updated.avatarImages });
  })
);

module.exports = router;
