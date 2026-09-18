const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { getUser, findUserByPhone, listReferrals } = require("../data/users");
const { publicUsers } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");

// Партнёрская программа — та же реферальная ссылка, что уже есть на экране
// Premium (referralCode; приглашённый и пригласивший получают по 30 дней
// Premium — см. routes/auth.js), плюс прямой чат с администрацией для
// отдельных условий сотрудничества (для блогеров/каналов — не то же самое,
// что обычное «пригласи друга»). Тарифы — не число в базе, а текст ниже:
// реальные условия задаёт человек, который держит проект, а не код. Чтобы
// поменять — редактируется PARTNER_TARIFF_TEXT.
const PARTNER_TARIFF_TEXT =
  "Условия партнёрской программы обсуждаются индивидуально — напишите администрации через кнопку ниже, расскажите про свою аудиторию, и вам предложат тариф.";

const router = express.Router();
router.use(requireUserId);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const referrals = await listReferrals(req.uid);
    res.json({
      referralCode: me.referralCode,
      referrals: publicUsers(referrals),
      tariffText: PARTNER_TARIFF_TEXT,
    });
  })
);

// Открывает (или возвращает) личный чат с администрацией специально под
// партнёрку — не с ботом поддержки (Hugo, server/routes/support.js): это
// деловой вопрос, который решает человек, а не автоответчик. Первое
// сообщение шлёт сам обратившийся, чтобы администратор сразу увидел, зачем
// открыли чат, а не пустую комнату.
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
