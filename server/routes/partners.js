const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { findUserByPhone } = require("../data/users");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");

const PARTNER_TARIFF_TEXT =
  "Условия партнёрской программы обсуждаются индивидуально — напишите администрации через кнопку ниже, расскажите про свою аудиторию, и вам предложат тариф.";

const router = express.Router();
router.use(requireUserId);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    res.json({
      tariffText: PARTNER_TARIFF_TEXT,
    });
  })
);

router.post(
  "/chat",
  asyncRoute(async (req, res) => {
    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    if (admin.id === req.uid) return res.status(400).json({ error: "Вы и есть администрация" });

    const chat = await findOrCreateDm(req.uid, admin.id);
    const existing = await listMessages(chat.id, req.uid);
    if (existing.length === 0) {
      await sendMessageAndBroadcast(chat, req.uid, "Здравствуйте! Хочу узнать про партнёрскую программу.");
    }
    res.json({ chatId: chat.id });
  })
);

module.exports = router;
