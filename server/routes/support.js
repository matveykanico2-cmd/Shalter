const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { HUGO_ID, ensureHugoAccount } = require("../data/hugoBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");
const { findUserByPhone } = require("../data/users");
const { ADMIN_PHONE } = require("../config");

const router = express.Router();
router.use(requireUserId);

// Чат с Hugo; в пустой чат — приветствие (один раз).
async function openHugoChat(uid) {
  ensureHugoAccount();
  const chat = await findOrCreateDm(uid, HUGO_ID);
  const existing = await listMessages(chat.id, uid);
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
  return chat;
}

router.post(
  "/chat",
  asyncRoute(async (req, res) => {
    const chat = await openHugoChat(req.uid);
    res.json({ chatId: chat.id });
  })
);

router.post(
  "/report",
  asyncRoute(async (req, res) => {
    const admin = ADMIN_PHONE ? await findUserByPhone(ADMIN_PHONE) : null;
    if (!admin || admin.id === req.uid) {
      const chat = await openHugoChat(req.uid);
      return res.json({ chatId: chat.id });
    }
    const chat = await findOrCreateDm(req.uid, admin.id);
    const existing = await listMessages(chat.id, req.uid);
    if (existing.length === 0) {
      await sendMessageAndBroadcast(
        chat,
        admin.id,
        "Здравствуйте! Это чат с администрацией Shalter.\n\n" +
          "Опишите ошибку: что вы делали, что ожидали и что получилось — по возможности приложите скриншот. Мы разберёмся."
      );
    }
    res.json({ chatId: chat.id });
  })
);

module.exports = router;
