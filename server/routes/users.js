const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listUsers, updateUser, getUser, setBlocked } = require("../data/users");
const { publicUser, publicUsers } = require("../data/sanitize");
const { getSettings } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");

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

// Powers the profile view (public/js/components/profileDialog.js). Unlike
// every other place a user object gets sent to a client (chat lists,
// message senders, contacts...), this is the one spot that actually
// enforces the target's Settings → Privacy choices for phone/last-seen —
// those settings exist but nothing reads them anywhere else yet; scoping
// the fix to this new profile endpoint rather than auditing every publicUser
// call site is a deliberate, contained improvement, not a claim that
// privacy is now enforced everywhere.
router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "not found" });

    const isSelf = req.params.id === req.uid;
    const visible = publicUser(user);
    // "contacts"-level privacy means "people *the target* has added" (same
    // sense as Telegram's "My Contacts") — so this checks the target's own
    // contact list for the viewer, not the other way around.
    const targetsContacts = isSelf ? [] : await listContactsFor(req.params.id);
    const isContact = !isSelf && targetsContacts.some((c) => c.userId === req.uid);

    if (!isSelf) {
      const { privacy } = await getSettings(req.params.id);
      const canSee = (level) => level === "everyone" || (level === "contacts" && isContact);
      if (!canSee(privacy.phone)) delete visible.phone;
      if (!canSee(privacy.lastSeen)) delete visible.lastSeen;
    }

    res.json({ user: visible, isContact });
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
