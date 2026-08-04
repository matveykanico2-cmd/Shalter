const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { getUser, findUserByPhone, grantPremiumDays } = require("../data/users");
const { listGifts, getGift } = require("../data/gifts");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json({ gifts: listGifts() });
  })
);

function durationLabel(days) {
  if (days === 0) return null;
  if (days == null) return "Premium навсегда";
  return `Premium на ${days} дней`;
}

// Same trust model as "Купить Premium" (server/routes/premium.js): no
// payment gateway, so this just tells the admin what's wanted and who for.
// The gift only actually lands once the admin confirms via /deliver below,
// after the real transfer to ADMIN_PHONE comes in.
router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    const recipientId = req.body?.recipientId || req.uid;
    const recipient = await getUser(recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    if (admin.id === req.uid) return res.status(400).json({ error: "Вы уже администратор Shalter" });

    const forSelf = recipientId === req.uid;
    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `🎁 Хочу подарить ${gift.emoji} «${gift.name}» за ${gift.priceRub}₽ ${forSelf ? "себе" : `пользователю ${recipient.name}`}. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

// Actually delivers a gift — restricted to whoever currently holds
// ADMIN_PHONE, same as Premium's /grant. Posts the announcement in the
// admin's DM with the recipient (that's the chat the recipient will
// actually see it in) and applies the Premium duration if the gift grants one.
router.post(
  "/deliver",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (me.phone !== ADMIN_PHONE) return res.status(403).json({ error: "Недостаточно прав" });

    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    const recipient = await getUser(req.body?.recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });

    if (gift.premiumDays !== 0) await grantPremiumDays(recipient.id, gift.premiumDays);

    const duration = durationLabel(gift.premiumDays);
    const chat = await findOrCreateDm(req.uid, recipient.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `🎁 Вам подарили: ${gift.emoji} «${gift.name}»!${duration ? ` ${duration} активирован.` : ""}`
    );
    res.json({ user: publicUser(await getUser(recipient.id)) });
  })
);

module.exports = router;
