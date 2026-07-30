const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listUsers, updateUser, getUser, setBlocked } = require("../data/users");
const { publicUser, publicUsers } = require("../data/sanitize");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const users = await listUsers();
    res.json({ users: publicUsers(users.filter((u) => u.id !== req.uid)) });
  })
);

// Only profile fields may be edited this way — never credentials
// (passwordHash/passwordSalt/email/id), even for your own account.
const EDITABLE_FIELDS = ["name", "username", "bio", "avatarColor", "avatarImage"];

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "not found" });
    res.json({ user: publicUser(user) });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    if (req.params.id !== req.uid) return res.status(403).json({ error: "forbidden" });
    const body = req.body ?? {};
    const patch = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) patch[key] = body[key];
    }
    const user = await updateUser(req.params.id, patch);
    res.json({ user: user ? publicUser(user) : null });
  })
);

router.post(
  "/:id/block",
  asyncRoute(async (req, res) => {
    const { blocked } = req.body ?? {};
    const user = await setBlocked(req.uid, req.params.id, blocked);
    res.json({ user: user ? publicUser(user) : null });
  })
);

module.exports = router;
