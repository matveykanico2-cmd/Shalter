const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, BUSINESS_GRANT_DAYS, BUSINESS_PLANS, DEFAULT_BUSINESS_PLAN, isAdminPhone } = require("../config");
const { getUser, findUserByPhone, grantBusinessDays, revokeBusiness } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { getActiveDonationLink } = require("../lib/autoPayment");
const { createPendingOrder } = require("../data/pendingOrders");
const { getSettings } = require("../data/settings");

const router = express.Router();
router.use(requireUserId);

// Same "message the admin / DonationAlerts" purchase flow as Premium
// (server/routes/premium.js) — the request/grant/plans shape below mirrors
// that file closely on purpose, so the two features don't drift apart in how
// buying works. See that file's comments for the reasoning behind each step.
router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const settings = await getSettings(req.uid);
    res.json({
      isBusiness: !!me.isBusiness,
      businessUntil: me.businessUntil,
      businessForever: !!me.businessForever,
      businessAddress: me.businessAddress ?? null,
      businessLat: me.businessLat ?? null,
      businessLng: me.businessLng ?? null,
      isAdmin: isAdminPhone(me.phone),
      plans: BUSINESS_PLANS,
      business: settings.business,
    });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const planId = BUSINESS_PLANS[req.body?.plan] ? req.body.plan : DEFAULT_BUSINESS_PLAN;
    const plan = BUSINESS_PLANS[planId];

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) {
      return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    }
    const me = await getUser(req.uid);
    if (me.isBusiness) {
      return res.status(400).json({ error: "У вас уже есть Shalter для бизнеса" });
    }

    if (admin.id === req.uid) {
      await grantBusinessDays(req.uid, plan.days);
      const chat = await findOrCreateDm(req.uid, req.uid);
      await sendMessageAndBroadcast(
        chat,
        req.uid,
        `🏢 Вам выдан Shalter для бизнеса на ${plan.label}! Спасибо, что поддерживаете проект.`
      );
      return res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE, delivered: true });
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: req.uid, kind: "business", amountRub: plan.priceRub });
      return res.json({ code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: plan.priceRub });
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `Хочу оформить Shalter для бизнеса на ${plan.label} за ${plan.priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
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
    const { userId, business, days, forever } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = business !== false;
    const dayCount = Number(days) > 0 ? Math.floor(Number(days)) : BUSINESS_GRANT_DAYS;
    if (grant) await grantBusinessDays(userId, forever ? null : dayCount);
    else await revokeBusiness(userId);

    const chat = await findOrCreateDm(req.uid, userId);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      grant
        ? `🏢 Вам выдан Shalter для бизнеса${forever ? " навсегда" : ` на ${dayCount} дней`}!`
        : "Ваш Shalter для бизнеса был отключён администрацией."
    );
    const updatedUser = publicUser(await getUser(userId));
    broadcastToUsers([userId], { type: "self:updated", user: updatedUser });
    res.json({ user: updatedUser });
  })
);

module.exports = router;
