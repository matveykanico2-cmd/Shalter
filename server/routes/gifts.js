const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { getUser, findUserByPhone } = require("../data/users");
const { listGifts, getGift } = require("../data/gifts");
const { remaining } = require("../data/giftIssues");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { deliverGift } = require("../lib/deliverGift");
const { isConnected: isDonationAlertsConnected, getDonationPageUrl } = require("../lib/donationAlerts");
const { createPendingOrder } = require("../data/pendingOrders");

const router = express.Router();
router.use(requireUserId);

// "все 1 экземпляров" reads as broken Russian, and the supplies in the
// catalog (1, 3, 5, 10, 25, 50) hit every branch of the rule — so this is
// a real declension, not decoration.
function copiesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "экземпляр";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "экземпляра";
  return "экземпляров";
}

function soldOutError(gift) {
  return gift.supply === 1
    ? `«${gift.name}» распродан — единственный экземпляр уже забрали`
    : `«${gift.name}» распродан — все ${gift.supply} ${copiesWord(gift.supply)} уже разобраны`;
}

// `remaining` is computed per request rather than stored on the catalog —
// it changes every time a limited gift is delivered, and the catalog itself
// is a static module-level array shared by every caller.
router.get(
  "/",
  asyncRoute(async (_req, res) => {
    const gifts = listGifts().map((g) => (g.supply ? { ...g, remaining: remaining(g) } : g));
    res.json({ gifts });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const gift = getGift(req.body?.giftId);
    if (!gift) return res.status(404).json({ error: "Подарок не найден" });
    const recipientId = req.body?.recipientId || req.uid;
    const recipient = await getUser(recipientId);
    if (!recipient) return res.status(404).json({ error: "Получатель не найден" });

    // Checked up front so a sold-out limited gift fails here, before anyone
    // is told to transfer money for it. It's re-checked at delivery time
    // too (that's the check that actually protects the supply) — the last
    // copy can still sell between paying and the payment clearing, which
    // lib/donationAlerts.js handles by telling the buyer rather than
    // silently pocketing it.
    if (gift.supply && remaining(gift) <= 0) {
      return res.status(410).json({ error: soldOutError(gift) });
    }

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });

    // The admin has nobody to send a payment request *to* — they'd just be
    // asking themselves for confirmation — so their gifts deliver instantly
    // and for free instead of round-tripping through the same "перевожу и
    // жду подтверждения" message everyone else sends.
    if (admin.id === req.uid) {
      const result = await deliverGift({ gift, recipientId: recipient.id, fromId: req.uid, announceFromId: req.uid });
      if (!result.ok) return res.status(410).json({ error: soldOutError(gift) });
      return res.json({ chatId: result.chat.id, adminPhone: ADMIN_PHONE, delivered: true, serial: result.serial });
    }

    const forSelf = recipientId === req.uid;

    // Same as premium.js's /request — DonationAlerts if connected, otherwise a
    // plain transfer that the admin fulfils from the buyer's profile.
    if (isDonationAlertsConnected()) {
      const donationUrl = getDonationPageUrl();
      if (donationUrl) {
        const order = await createPendingOrder({ userId: req.uid, kind: "gift", giftId: gift.id, recipientId, amountRub: gift.priceRub });
        return res.json({ code: order.code, donationUrl, amountRub: gift.priceRub });
      }
    }

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

    const result = await deliverGift({ gift, recipientId: recipient.id, fromId: req.uid, announceFromId: req.uid });
    if (!result.ok) {
      return res.status(410).json({ error: soldOutError(gift) });
    }
    res.json({ user: publicUser(await getUser(recipient.id)), serial: result.serial });
  })
);

module.exports = router;
