const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, PREMIUM_GRANT_DAYS, isAdminPhone } = require("../config");
const { getUser, findUserByPhone, listReferrals, grantPremiumDays, revokePremium } = require("../data/users");
const { publicUser, publicUsers } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { isConnected: isDonationAlertsConnected, getDonationPageUrl } = require("../lib/donationAlerts");
const { createPendingOrder } = require("../data/pendingOrders");

const router = express.Router();
router.use(requireUserId);

// Referral code + Premium status for the current user, plus who they've
// brought in — powers the Settings → Premium screen.
router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const referrals = await listReferrals(req.uid);
    res.json({
      isPremium: !!me.isPremium,
      premiumUntil: me.premiumUntil,
      premiumForever: !!me.premiumForever,
      referralCode: me.referralCode,
      isAdmin: isAdminPhone(me.phone),
      referrals: publicUsers(referrals),
    });
  })
);

// "Купить Premium за 10₽" — there's no payment gateway here (see AGENTS.md:
// this is a plain self-hosted Express app), so buying opens a DM with
// whichever account currently holds ADMIN_PHONE and drops a message asking
// for confirmation. The admin then grants Premium by hand from that chat
// (see /grant below) once the 10₽ actually lands on their phone. The full
// Gifts catalog (server/routes/gifts.js) covers every other price/duration —
// this endpoint is kept as the one-tap "just give me Premium" shortcut.
router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) {
      return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    }
    const me = await getUser(req.uid);
    if (me.isPremium) {
      return res.status(400).json({ error: "У вас уже есть Shalter Premium" });
    }

    // Same "nobody to ask" reasoning as gifts.js's /request — the admin
    // grants themselves Premium immediately instead of messaging themselves
    // to wait for their own confirmation. findOrCreateDm(req.uid, req.uid)
    // is a real self-chat (deduped in systemChat.js), same one every other
    // self-delivered grant lands in — not a special-cased dead end.
    if (admin.id === req.uid) {
      await grantPremiumDays(req.uid, PREMIUM_GRANT_DAYS);
      const chat = await findOrCreateDm(req.uid, req.uid);
      await sendMessageAndBroadcast(
        chat,
        req.uid,
        `🎉 Вам выдан Shalter Premium на ${PREMIUM_GRANT_DAYS} дней! Спасибо, что поддерживаете проект.`
      );
      return res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE, delivered: true });
    }

    // Two ways to pay. DonationAlerts, if the admin connected it, clears
    // automatically (the donation feed carries the order code — see
    // lib/donationAlerts.js). Otherwise it's a plain transfer to the admin's
    // phone: this drops the request into their DM, and they hand Premium over
    // from the buyer's profile (public/js/components/adminUserPanel.js).
    if (isDonationAlertsConnected()) {
      const donationUrl = getDonationPageUrl();
      if (donationUrl) {
        const order = await createPendingOrder({ userId: req.uid, kind: "premium", amountRub: 10 });
        return res.json({ code: order.code, donationUrl, amountRub: 10 });
      }
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `Хочу оформить Shalter Premium на ${PREMIUM_GRANT_DAYS} дней за 10₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

// Grants (or revokes) Premium for another account — restricted to whoever
// currently holds ADMIN_PHONE, checked fresh on every call (not cached: the
// phone can move to a different account, e.g. on re-registration). This is the
// endpoint behind the "выдать" buttons on a user's profile
// (public/js/components/adminUserPanel.js): the buyer transfers the money and
// the admin hands the purchase over from there.
//
// `days`: a positive number of days, or omit for the standard grant length.
// `forever: true` grants it permanently. `premium: false` revokes.
//
// The forever case needed fixing rather than just wiring up: data/users.js's
// grantPremiumDays takes `days == null` to mean forever, but this route used to
// collapse that with `days ?? PREMIUM_GRANT_DAYS`, so null arrived as 30 and
// permanent Premium was simply unreachable through the API. Meanwhile the
// message below had a branch that read `days === 0` as "навсегда" — and 0 days
// sets premiumUntil to *now*, i.e. it announced permanent Premium while
// actually leaving the account without any.
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
    // Значок Premium держится в состоянии клиента (state.js's `user`, читает
    // navRail и весь остальной интерфейс) и без явного толчка не узнаёт об
    // изменении, пока человек не перезайдёт: сообщение выше долетает в чат, но
    // сам профиль — нет. Раньше это и оставляло золотое кольцо на аватарке
    // висеть до перезахода даже после того, как админ его отключил.
    broadcastToUsers([userId], { type: "self:updated", user: updatedUser });
    res.json({ user: updatedUser });
  })
);

module.exports = router;
