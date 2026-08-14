const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listContactsFor, addContact, renameContact, removeContact } = require("../data/contacts");
const { listUsers, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { getSettings } = require("../data/settings");
const { phoneKey, indexUsersByPhone } = require("../lib/phoneMatch");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const [contacts, users] = await Promise.all([listContactsFor(req.uid), listUsers()]);
    const resolved = contacts
      .map((c) => {
        const user = users.find((u) => u.id === c.userId);
        return user ? { ...c, localName: c.localName ?? null, user: publicUser(user) } : null;
      })
      .filter((c) => c !== null);
    res.json({ contacts: resolved });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { userId, localName } = req.body ?? {};
    if (!userId || userId === req.uid) return res.status(400).json({ error: "Некорректный контакт" });
    if (!(await getUser(userId))) return res.status(404).json({ error: "Пользователь не найден" });
    const contact = await addContact({
      id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: req.uid,
      userId,
      addedAt: new Date().toISOString(),
      localName: typeof localName === "string" ? localName.trim().slice(0, 80) : null,
    });
    res.json({ contact });
  })
);

// Renaming a contact — your own label for them, visible only to you.
router.post(
  "/rename",
  asyncRoute(async (req, res) => {
    const { userId, localName } = req.body ?? {};
    const contact = await renameContact(req.uid, userId, typeof localName === "string" ? localName.trim().slice(0, 80) : null);
    if (!contact) return res.status(404).json({ error: "Контакт не найден" });
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

// Matching an address book against registered accounts, so people don't have to
// type an exact @handle for everyone they already know (which was previously the
// only way to add anyone — see public/js/views/contacts.js).
//
// What this deliberately does NOT do: store anything. The uploaded numbers are
// matched in memory and dropped when the response is written — no "contacts
// graph" is accumulated server-side, so someone else uploading your number later
// still can't learn anything about who *you* know.
//
// It is still, unavoidably, an "is this number registered?" oracle: anyone can
// upload numbers and see which come back. That's inherent to the feature (every
// messenger with contact sync has it) and is bounded here rather than pretended
// away — a hard cap per request, the general API rate limit on top, and a
// per-account privacy setting that removes you from it entirely.
const MAX_PHONES_PER_REQUEST = 1000;

router.post(
  "/match",
  asyncRoute(async (req, res) => {
    const entries = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    if (entries.length > MAX_PHONES_PER_REQUEST) {
      return res.status(413).json({ error: `За один раз можно проверить не больше ${MAX_PHONES_PER_REQUEST} номеров` });
    }

    const me = await getUser(req.uid);
    const [users, myContacts] = await Promise.all([listUsers(), listContactsFor(req.uid)]);
    const contactIds = new Set(myContacts.map((c) => c.userId));
    const blockedByMe = new Set(me?.blockedUserIds ?? []);

    // Index every account by phone first and resolve the uploaded numbers
    // against it; only the handful that actually matched then get the privacy
    // check. Doing it the other way round (filter everyone first) meant loading
    // settings and the contact list for every account on the server on every
    // request, most of which no uploaded number was ever going to hit.
    const index = indexUsersByPhone(users, () => true);

    const candidates = [];
    const notFound = [];
    const seen = new Set();
    for (const entry of entries) {
      const key = phoneKey(entry?.phone);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const name = typeof entry?.name === "string" ? entry.name.slice(0, 120) : "";
      const user = index.get(key);
      const phone = String(entry?.phone ?? "").slice(0, 40);
      if (user) candidates.push({ user, name, phone });
      else notFound.push({ phone, name });
    }

    // "Кто может найти меня по номеру телефона" (Settings → Конфиденциальность),
    // checked per matched account — the "contacts" level depends on whether
    // *that* account has the searcher in its own contact list.
    //
    // An account that fails any of these checks is reported as *not registered*
    // rather than dropped from the response. Dropping it would itself be the
    // leak: a number that came back in neither list is a number that exists but
    // is hidden, which is precisely what "Никто" is supposed to conceal. Being
    // indistinguishable from an unused number is the whole point, and it also
    // means the uploaded number doesn't silently vanish from the UI.
    const found = [];
    for (const { user, name, phone } of candidates) {
      const hide = () => notFound.push({ phone, name });

      if (user.id === req.uid) continue; // your own number: neither a match nor an invite
      if (user.isBanned) {
        hide();
        continue;
      }
      if ((user.blockedUserIds ?? []).includes(req.uid) || blockedByMe.has(user.id)) {
        hide();
        continue;
      }

      const level = (await getSettings(user.id))?.privacy?.discoverByPhone ?? "everyone";
      if (level === "nobody") {
        hide();
        continue;
      }
      if (level === "contacts") {
        const theirContacts = await listContactsFor(user.id);
        if (!theirContacts.some((c) => c.userId === req.uid)) {
          hide();
          continue;
        }
      }

      found.push({
        user: publicUser(user),
        // So the list can show "уже в контактах" instead of offering to add
        // someone who is already there.
        alreadyContact: contactIds.has(user.id),
        // The name from *their* address book, usually more recognisable to them
        // than the account's own display name.
        localName: name,
      });
    }

    res.json({ found, notFound, checked: seen.size });
  })
);

module.exports = router;
