const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listContactsFor, addContact, renameContact, removeContact, setContactNote, contactNote } = require("../data/contacts");
const { listUsers, listUsersByIds, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { allowsUser, publicUserFor, exceptionsFor, normalizePrivacy } = require("../lib/privacyRules");
const { getSettings, updateSettings } = require("../data/settings");
const { phoneKey, indexUsersByPhone } = require("../lib/phoneMatch");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const contacts = await listContactsFor(req.uid);
    const users = await listUsersByIds(contacts.map((c) => c.userId));
    const byId = new Map(users.map((u) => [u.id, u]));
    const resolved = (
      await Promise.all(
        contacts.map(async (c) => {
          const user = byId.get(c.userId);
          if (!user) return null;
          const visible = await publicUserFor(user, req.uid);
          if (await allowsUser(user.id, "phone", req.uid)) visible.phone = user.phone;
          return { ...c, localName: c.localName ?? null, note: contactNote(c), user: visible };
        })
      )
    ).filter((c) => c !== null);
    res.json({ contacts: resolved });
  })
);

router.get(
  "/ids",
  asyncRoute(async (req, res) => {
    const contacts = await listContactsFor(req.uid);
    res.json({ ids: contacts.map((c) => c.userId) });
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
    // «Поделиться моим номером», как в Telegram: этот человек увидит ваш номер,
    // даже если в приватности он скрыт (исключение «Всегда показывать»).
    if (req.body?.sharePhone === true) {
      const settings = await getSettings(req.uid);
      const privacy = settings.privacy ?? {};
      const { allow, deny } = exceptionsFor(privacy, "phone");
      const exceptions = {
        ...(privacy.exceptions ?? {}),
        phone: { allow: [...new Set([...allow, userId])], deny: deny.filter((id) => id !== userId) },
      };
      await updateSettings(req.uid, { privacy: normalizePrivacy({ ...privacy, exceptions }) });
    }
    res.json({ contact });
  })
);

router.post(
  "/note",
  asyncRoute(async (req, res) => {
    const { userId } = req.body ?? {};
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
    if (!(await setContactNote(req.uid, userId, note || null))) return res.status(404).json({ error: "Сначала добавьте человека в контакты" });
    res.json({ note: note || null });
  })
);

router.post(
  "/rename",
  asyncRoute(async (req, res) => {
    const { userId, localName } = req.body ?? {};
    const contact = await renameContact(req.uid, userId, typeof localName === "string" ? localName.trim().slice(0, 80) : null);
    if (!contact) return res.status(404).json({ error: "Контакт не найден" });
    res.json({ contact: { ...contact, note: contactNote(contact) } });
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

    const found = [];
    for (const { user, name, phone } of candidates) {
      const hide = () => notFound.push({ phone, name });

      if (user.id === req.uid) continue;
      if (user.isBanned) {
        hide();
        continue;
      }
      if ((user.blockedUserIds ?? []).includes(req.uid) || blockedByMe.has(user.id)) {
        hide();
        continue;
      }

      if (!(await allowsUser(user.id, "discoverByPhone", req.uid))) {
        hide();
        continue;
      }

      found.push({
        user: publicUser(user),
        alreadyContact: contactIds.has(user.id),
        localName: name,
      });
    }

    res.json({ found, notFound, checked: seen.size });
  })
);

module.exports = router;
