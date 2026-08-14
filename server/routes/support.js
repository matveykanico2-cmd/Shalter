const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { HUGO_ID, ensureHugoAccount } = require("../data/hugoBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");

// One route: give me the chat with support. It creates the DM on first use and
// seeds a greeting, so opening support never lands you in an empty room with no
// idea whether anyone is there — which, before Hugo answered anything, is
// exactly what it was.
const router = express.Router();
router.use(requireUserId);

router.post(
  "/chat",
  asyncRoute(async (req, res) => {
    // Defensive: a deployment upgraded while running won't have been through
    // startup seeding yet.
    ensureHugoAccount();
    const chat = await findOrCreateDm(req.uid, HUGO_ID);
    const existing = await listMessages(chat.id, req.uid);
    if (existing.length === 0) {
      await sendMessageAndBroadcast(
        chat,
        HUGO_ID,
        "Здравствуйте! Я Hugo — поддержка Shalter.\n\n" +
          "Спросите про звёзды, Premium, подарки, двухфакторную аутентификацию, ботов или где скачать приложение — отвечу сразу.\n\n" +
          "Если проблема сложнее, опишите её: что вы делали, что ожидали и что получилось. Такое сообщение прочитает человек.\n\n" +
          "И ещё я проверяю тексты — напишите «проверь» и следом фразу."
      );
    }
    res.json({ chatId: chat.id });
  })
);

module.exports = router;
