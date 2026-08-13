const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listUsers, updateUser, getUser, setBlocked, findUserByUsername, findUserByPhone } = require("../data/users");
const { publicUser, publicUsers } = require("../data/sanitize");
const { getSettings } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");
const { listChats } = require("../data/chats");
const { listMessages } = require("../data/messages");
const { PHONE_RE, normalizePhone } = require("../lib/validators");
const { checkUsername, normalizeUsername, isUsernameConflict } = require("../lib/username");

const LINK_RE = /https?:\/\/\S+/;

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const users = await listUsers();
    res.json({ users: publicUsers(users.filter((u) => u.id !== req.uid)) });
  })
);

// Exact-match-only lookup — the one legitimate way to find someone to add as
// a contact (see public/js/views/contacts.js): unlike GET / above (which
// dumps every user on the server and used to power a browse-and-click "add
// contact" list), this can't be used to enumerate/browse anyone, only to
// resolve a specific @username you already know, same as Telegram's own
// "add by username" flow.
router.get(
  "/by-username/:username",
  asyncRoute(async (req, res) => {
    const user = await findUserByUsername(req.params.username);
    if (!user || user.id === req.uid) return res.status(404).json({ error: "not found" });
    res.json({ user: publicUser(user) });
  })
);

// Only profile fields may be edited this way — never credentials
// (passwordHash/passwordSalt/email/id), even for your own account. username
// and phone get their own uniqueness/format checks below (same rules as
// registration — see server/lib/validators.js) since, unlike name/bio, other
// people rely on these being unique to find/message the right account.
const EDITABLE_FIELDS = ["name", "username", "phone", "bio", "avatarColor", "avatarImage", "birthday"];

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
      if (!canSee(privacy.bio)) delete visible.bio;
      if (!canSee(privacy.birthday)) delete visible.birthday;
    }

    res.json({ user: visible, isContact });
  })
);

// Media/Files/Links tabs on the profile view (profileDialog.js) — scoped to
// whatever DM already exists between the viewer and this user. Deliberately
// looks up (never creates) that DM: opening someone's profile shouldn't have
// the side effect of starting a chat with them, the same way it doesn't in
// Telegram. No DM yet (or no matching attachments) just means empty tabs.
router.get(
  "/:id/shared-media",
  asyncRoute(async (req, res) => {
    const empty = { media: [], files: [], links: [] };
    if (req.params.id === req.uid) return res.json(empty);

    const chat = (await listChats()).find(
      (c) => c.type === "dm" && c.memberIds.includes(req.uid) && c.memberIds.includes(req.params.id)
    );
    if (!chat) return res.json(empty);

    const messages = await listMessages(chat.id, req.uid);
    const media = [];
    const files = [];
    const links = [];
    for (const m of messages) {
      for (const a of m.attachments ?? []) {
        if (a.kind === "image" || a.kind === "video") media.push({ messageId: m.id, createdAt: m.createdAt, attachment: a });
        else if (a.kind === "file") files.push({ messageId: m.id, createdAt: m.createdAt, attachment: a });
      }
      if (m.linkPreview || LINK_RE.test(m.text ?? "")) {
        links.push({ messageId: m.id, createdAt: m.createdAt, text: m.text, linkPreview: m.linkPreview });
      }
    }
    res.json({ media: media.reverse(), files: files.reverse(), links: links.reverse() });
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

    if ("username" in patch) {
      // Shared with registration and with a channel claiming a public handle
      // (lib/username.js). This branch used to check only the users table,
      // while routes/chats.js's /:id/public checked both — so a person could
      // take a handle a public channel already had, and /u/:username then
      // resolved to whichever of the two the lookup happened to hit first.
      patch.username = normalizeUsername(patch.username);
      const problem = await checkUsername(patch.username, { forUserId: req.uid });
      if (problem) return res.status(problem.status).json({ error: problem.error });
    }
    if ("phone" in patch) {
      const normalized = normalizePhone(patch.phone);
      if (!PHONE_RE.test(normalized)) {
        return res.status(400).json({ error: "Введите номер телефона в формате +79991234567" });
      }
      const existing = await findUserByPhone(normalized);
      if (existing && existing.id !== req.uid) return res.status(409).json({ error: "Этот номер уже используется другим аккаунтом" });
      patch.phone = normalized;
    }

    let user;
    try {
      user = await updateUser(req.params.id, patch);
    } catch (err) {
      if (isUsernameConflict(err)) return res.status(409).json({ error: "Этот юзернейм уже занят" });
      throw err;
    }
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
