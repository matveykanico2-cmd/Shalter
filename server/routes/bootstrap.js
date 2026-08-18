const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listChatsForUser } = require("../data/chats");
const { attachSummaries } = require("../data/chat-summary");
const { getSettings } = require("../data/settings");
const { listFoldersFor } = require("../data/folders");
const { listContactsFor } = require("../data/contacts");

// Всё, что нужно приложению при входе, одним ответом.
//
// Раньше это были три отдельных запроса подряд: настройки, список чатов,
// контакты. На плохой связи главная цена — не байты, а сама поездка до сервера:
// три поездки по 400 мс складывались в 1.2 с ожидания почти без данных.
// Ответы здесь ровно те же, что у /api/settings, /api/chats, /api/folders и
// /api/contacts/ids — те маршруты остаются, ими пользуются все обновления
// после входа.
const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const [settings, chats, folders, contacts] = await Promise.all([
      getSettings(req.uid),
      listChatsForUser(req.uid),
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
