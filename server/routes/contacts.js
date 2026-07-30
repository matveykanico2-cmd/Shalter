const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listContactsFor, addContact, removeContact } = require("../data/contacts");
const { listUsers } = require("../data/users");
const { publicUser } = require("../data/sanitize");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const [contacts, users] = await Promise.all([listContactsFor(req.uid), listUsers()]);
    const resolved = contacts
      .map((c) => {
        const user = users.find((u) => u.id === c.userId);
        return user ? { ...c, user: publicUser(user) } : null;
      })
      .filter((c) => c !== null);
    res.json({ contacts: resolved });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { userId } = req.body ?? {};
    const contact = await addContact({ id: `ct_${Date.now()}`, ownerId: req.uid, userId, addedAt: new Date().toISOString() });
    res.json({ contact });
  })
);

router.delete(
  "/",
  asyncRoute(async (req, res) => {
    const { userId } = req.body ?? {};
    await removeContact(req.uid, userId);
    res.json({ ok: true });
  })
);

module.exports = router;
