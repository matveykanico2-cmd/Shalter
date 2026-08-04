const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, PREMIUM_GRANT_DAYS } = require("../config");
const { getUser, findUserByPhone, listReferrals, grantPremiumDays, revokePremium } = require("../data/users");
const { publicUser, publicUsers } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");

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
      isAdmin: me.phone === ADMIN_PHONE,
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
    if (admin.id === req.uid) {
      return res.status(400).json({ error: "Вы уже администратор Shalter" });
    }
    const me = await getUser(req.uid);
    if (me.isPremium) {
      return res.status(400).json({ error: "У вас уже есть Shalter Premium" });
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
// phone can move to a different account, e.g. on re-registration). `days`
// defaults to the standard grant length; omit `premium` (or pass it as
// `false`) to revoke instead.
router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (me.phone !== ADMIN_PHONE) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const { userId, premium, days } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = premium !== false;
    if (grant) await grantPremiumDays(userId, days ?? PREMIUM_GRANT_DAYS);
    else await revokePremium(userId);

    const chat = await findOrCreateDm(req.uid, userId);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      grant
        ? `🎉 Вам выдан Shalter Premium${days == null ? ` на ${PREMIUM_GRANT_DAYS} дней` : days ? ` на ${days} дней` : " навсегда"}! Спасибо, что поддерживаете проект.`
        : "Ваш Shalter Premium был отключён администрацией."
    );
    res.json({ user: publicUser(await getUser(userId)) });
  })
);

module.exports = router;
