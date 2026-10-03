const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listChatsForUser } = require("../data/chats");
const { attachSummaries } = require("../data/chat-summary");
const { getSettings } = require("../data/settings");
const { listFoldersFor } = require("../data/folders");
const { listContactsFor } = require("../data/contacts");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const [settings, chats, folders, contacts] = await Promise.all([
      getSettings(req.uid),
      listChatsForUser(req.uid, { deviceId: req.cookies?.device_id ?? null }),
      listFoldersFor(req.uid),
      listContactsFor(req.uid),
    ]);
    const withSummary = await attachSummaries(chats, req.uid);
    const hidden = settings.hiddenChats ?? {};
    res.json({
      settings,
      chats: withSummary.filter((c) => !hidden[c.id] || c.lastMessage),
      folders,
      contactIds: contacts.map((c) => c.userId),
    });
  })
);

module.exports = router;
