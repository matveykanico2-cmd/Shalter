const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { SUPPORT_ID, ensureSupportAccount } = require("../data/supportAccount");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");

// One route: give me the chat with support. It creates the DM on first use and
// seeds a greeting, so opening support never lands you in an empty room with no
// idea whether anyone is there.
const router = express.Router();
router.use(requireUserId);

router.post(
  "/chat",
  asyncRoute(async (req, res) => {
    // Defensive: a deployment upgraded while running won't have been through
    // startup seeding yet.
    ensureSupportAccount();
    const chat = await findOrCreateDm(req.uid, SUPPORT_ID);
    const existing = await listMessages(chat.id, req.uid);
    if (existing.length === 0) {
      await sendMessageAndBroadcast(
        chat,
        SUPPORT_ID,
        "Здравствуйте! Это поддержка Shalter. Опишите, что случилось — что вы делали, что ожидали и что получилось. Если можно, приложите скриншот: так мы разберёмся быстрее."
      );
    }
    res.json({ chatId: chat.id });
  })
);

module.exports = router;
