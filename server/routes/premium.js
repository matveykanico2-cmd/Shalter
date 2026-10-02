const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, PREMIUM_GRANT_DAYS, isAdminPhone } = require("../config");
const { getPricing, getPremiumPlan, starsCostFor, plansAsMap } = require("../data/pricing");
const { getUser, findUserByPhone, grantPremiumDays, revokePremium } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { getActiveDonationLink } = require("../lib/autoPayment");
const { createPendingOrder } = require("../data/pendingOrders");
const { balanceOf, spendStars } = require("../data/stars");

const router = express.Router();
router.use(requireUserId);

function plansWithStars() {
  return plansAsMap(getPricing().premiumPlans, (plan) => ({ stars: starsCostFor(plan) }));
}

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    res.json({
      isPremium: !!me.isPremium,
      premiumUntil: me.premiumUntil,
      premiumForever: !!me.premiumForever,
      isAdmin: isAdminPhone(me.phone),
      plans: plansWithStars(),
      starsBalance: balanceOf(req.uid),
    });
  })
);

router.post(
  "/buy-with-stars",
  asyncRoute(async (req, res) => {
    const plan = getPremiumPlan(req.body?.plan);
    const cost = starsCostFor(plan);

    const me = await getUser(req.uid);
    if (me.premiumForever) {
      return res.status(400).json({ error: "У вас уже есть Shalter Premium навсегда" });
    }
    const extending = !!me.isPremium;

    if (!spendStars(req.uid, cost)) {
      return res.status(400).json({ error: `Недостаточно звёзд: нужно ${cost} ⭐` });
    }
    await grantPremiumDays(req.uid, plan.days);

    const chat = await findOrCreateDm(req.uid, req.uid);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `🎉 ${extending ? "Shalter Premium продлён" : "Вам выдан Shalter Premium"} на ${plan.label} за ${cost} ⭐!`
    );
    broadcastToUsers([req.uid], { type: "self:updated", user: publicUser(await getUser(req.uid)) });
    res.json({ delivered: true, stars: cost, balance: balanceOf(req.uid), chatId: chat.id });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const plan = getPremiumPlan(req.body?.plan);

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) {
      return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    }
    const me = await getUser(req.uid);
    if (me.premiumForever) {
      return res.status(400).json({ error: "У вас уже есть Shalter Premium навсегда" });
    }
    const extending = !!me.isPremium;

    if (admin.id === req.uid) {
      await grantPremiumDays(req.uid, plan.days);
      const chat = await findOrCreateDm(req.uid, req.uid);
      await sendMessageAndBroadcast(
        chat,
        req.uid,
        `🎉 ${extending ? "Shalter Premium продлён" : "Вам выдан Shalter Premium"} на ${plan.label}! Спасибо, что поддерживаете проект.`
      );
      return res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE, delivered: true });
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: req.uid, kind: "premium", amountRub: plan.priceRub, meta: { days: plan.days, label: plan.label } });
      return res.json({ code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: plan.priceRub });
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `Хочу ${extending ? "продлить" : "оформить"} Shalter Premium на ${plan.label} за ${plan.priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me.phone)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const { userId, premium, days, forever } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = premium !== false;
    const dayCount = Number(days) > 0 ? Math.floor(Number(days)) : PREMIUM_GRANT_DAYS;
    if (grant) await grantPremiumDays(userId, forever ? null : dayCount);
    else await revokePremium(userId);

    const chat = await findOrCreateDm(req.uid, userId);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      grant
        ? `🎉 Вам выдан Shalter Premium${forever ? " навсегда" : ` на ${dayCount} дней`}! Спасибо, что поддерживаете проект.`
        : "Ваш Shalter Premium был отключён администрацией."
    );
    const updatedUser = publicUser(await getUser(userId));
    broadcastToUsers([userId], { type: "self:updated", user: updatedUser });
    res.json({ user: updatedUser });
  })
);

module.exports = router;
