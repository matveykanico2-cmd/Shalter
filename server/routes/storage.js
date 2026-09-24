const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, STORAGE_PLANS, DEFAULT_STORAGE_PLAN, isAdminPhone } = require("../config");
const { getUser, findUserByPhone, grantStorage, revokeStorage } = require("../data/users");
const { attachmentBytesBySender } = require("../data/messages");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { getActiveDonationLink } = require("../lib/autoPayment");
const { createPendingOrder } = require("../data/pendingOrders");

const router = express.Router();
router.use(requireUserId);

// Тарифы облачного хранилища (config.js, STORAGE_PLANS). Покупка — тем же
// путём, что Premium и бизнес (server/routes/premium.js, business.js), и
// устроена так же, чтобы способы оплаты не разошлись между разделами.
//
// Лимита по умолчанию нет, и тариф ничего не ограничивает: загрузка файлов
// (routes/uploads.js) о нём не знает вовсе.

function periodLabel(plan) {
  return plan.period === "year" ? "на год" : "на месяц";
}

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const byKind = attachmentBytesBySender(req.uid);
    const usedBytes = Object.values(byKind).reduce((sum, k) => sum + k.bytes, 0);
    const fileCount = Object.values(byKind).reduce((sum, k) => sum + k.files, 0);
    res.json({
      usedBytes,
      fileCount,
      byKind,
      isStorageActive: !!me.isStorageActive,
      storageGb: me.isStorageActive ? me.storageGb : null,
      storageUntil: me.storageUntil ?? null,
      storageForever: !!me.storageForever,
      isAdmin: isAdminPhone(me.phone),
      plans: STORAGE_PLANS,
    });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const planId = STORAGE_PLANS[req.body?.plan] ? req.body.plan : DEFAULT_STORAGE_PLAN;
    const plan = STORAGE_PLANS[planId];

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) {
      return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    }
    const me = await getUser(req.uid);
    // Продлить свой объём или перейти на больший — можно в любой момент.
    // Меньший при действующем тарифе — нет: оплаченные гигабайты просто
    // пропали бы.
    if (me.isStorageActive && plan.gb < me.storageGb) {
      return res.status(400).json({ error: `У вас уже действует тариф на ${me.storageGb >= 1024 ? `${me.storageGb / 1024} ТБ` : `${me.storageGb} ГБ`} — меньший можно взять, когда он закончится` });
    }
    if (me.isStorageActive && me.storageForever && plan.gb === me.storageGb) {
      return res.status(400).json({ error: "Этот объём у вас уже навсегда" });
    }

    if (admin.id === req.uid) {
      await grantStorage(req.uid, plan.gb, plan.days);
      const chat = await findOrCreateDm(req.uid, req.uid);
      await sendMessageAndBroadcast(chat, req.uid, `☁️ Хранилище ${plan.label} подключено ${periodLabel(plan)}.`);
      return res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE, delivered: true });
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: req.uid, kind: "storage", amountRub: plan.priceRub });
      return res.json({ code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: plan.priceRub });
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `Хочу подключить хранилище ${plan.label} ${periodLabel(plan)} за ${plan.priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

// Выдача с профиля покупателя (public/js/components/adminUserPanel.js) после
// перевода. `plan` — id из STORAGE_PLANS (объём и срок берутся оттуда),
// `forever: true` — этот объём навсегда, `active: false` — отключить.
router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me.phone)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const { userId, plan: planId, active, forever } = req.body ?? {};
    const target = await getUser(userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const grant = active !== false;
    const plan = STORAGE_PLANS[planId];
    if (grant && !plan) return res.status(400).json({ error: "Неизвестный тариф" });
    if (grant) await grantStorage(userId, plan.gb, forever ? null : plan.days);
    else await revokeStorage(userId);

    const chat = await findOrCreateDm(req.uid, userId);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      grant
        ? `☁️ Вам подключено хранилище ${plan.label}${forever ? " навсегда" : ` ${periodLabel(plan)}`}!`
        : "Ваш тариф хранилища был отключён администрацией."
    );
    const updatedUser = publicUser(await getUser(userId));
    broadcastToUsers([userId], { type: "self:updated", user: updatedUser });
    res.json({ user: updatedUser });
  })
);

module.exports = router;
