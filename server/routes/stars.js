const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getUser, findUserByPhone } = require("../data/users");
const { getChat, listChatsForUser } = require("../data/chats");
const { getMessage, deleteMessage, setBoost } = require("../data/messages");
const { balanceOf, addStars, spendStars, setMessagePrice, transferStars } = require("../data/stars");
const { getPricing, getStarPack } = require("../data/pricing");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { publicUser } = require("../data/sanitize");
const { getActiveDonationLink } = require("../lib/autoPayment");
const { createPendingOrder } = require("../data/pendingOrders");

const BOOST_MINUTES = 60;
const MAX_MESSAGE_PRICE = 90000;

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const pricing = getPricing();
    res.json({
      balance: balanceOf(req.uid),
      userId: req.uid,
      messagePriceStars: me?.messagePriceStars ?? 0,
      packs: pricing.starPacks,
      costs: { boost: pricing.starCosts.boost, boostMinutes: BOOST_MINUTES, delete: pricing.starCosts.delete, maxMessagePrice: MAX_MESSAGE_PRICE },
    });
  })
);

router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const pack = getStarPack(req.body?.packId);
    if (!pack) return res.status(404).json({ error: "Такого набора нет" });

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    if (admin.id === req.uid) {
      addStars(req.uid, pack.stars);
      return res.json({ balance: balanceOf(req.uid), granted: true });
    }

    const donation = getActiveDonationLink();
    if (donation) {
      const order = await createPendingOrder({ userId: req.uid, kind: "stars", amountRub: pack.priceRub, meta: { stars: pack.stars } });
      return res.json({ code: order.code, donationUrl: donation.donationUrl, provider: donation.provider, amountRub: pack.priceRub });
    }

    const chat = await findOrCreateDm(req.uid, admin.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `⭐ Хочу купить ${pack.stars} звёзд за ${pack.priceRub}₽. Перевожу на ${ADMIN_PHONE} и жду подтверждения 🙏`
    );
    res.json({ chatId: chat.id, adminPhone: ADMIN_PHONE });
  })
);

router.post(
  "/grant",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!isAdminPhone(me?.phone)) return res.status(403).json({ error: "Недостаточно прав" });

    const target = await getUser(req.body?.userId);
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });
    const amount = Math.trunc(Number(req.body?.stars));
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: "Укажите количество звёзд" });
    if (amount < 0 && balanceOf(target.id) + amount < 0) {
      return res.status(409).json({ error: "Нельзя списать больше, чем есть на балансе" });
    }

    const balance = addStars(target.id, amount);
    const chat = await findOrCreateDm(req.uid, target.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      amount > 0 ? `⭐ Вам начислено ${amount} звёзд. Баланс: ${balance}.` : `Списано ${-amount} звёзд. Баланс: ${balance}.`
    );
    res.json({ user: publicUser(await getUser(target.id)), balance });
  })
);

router.post(
  "/price",
  asyncRoute(async (req, res) => {
    const price = Math.trunc(Number(req.body?.stars));
    if (!Number.isFinite(price) || price < 0 || price > MAX_MESSAGE_PRICE) {
      return res.status(400).json({ error: `Цена — от 0 до ${MAX_MESSAGE_PRICE} звёзд` });
    }
    setMessagePrice(req.uid, price);
    const dms = (await listChatsForUser(req.uid)).filter((c) => c.type === "dm");
    for (const dm of dms) broadcastToUsers(dm.memberIds, { type: "chat:updated", chat: { id: dm.id } });
    res.json({ messagePriceStars: price });
  })
);

async function memberChat(req, res) {
  const chat = await getChat(req.params.chatId ?? req.body?.chatId);
  if (!chat || !chat.memberIds.includes(req.uid)) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  return chat;
}

router.post(
  "/boost/:messageId",
  asyncRoute(async (req, res) => {
    const message = await getMessage(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Сообщение не найдено" });
    const chat = await getChat(message.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    const BOOST_COST = getPricing().starCosts.boost;
    if (!spendStars(req.uid, BOOST_COST)) {
      return res.status(402).json({ error: `Не хватает звёзд — нужно ${BOOST_COST}`, balance: balanceOf(req.uid) });
    }
    const until = new Date(Date.now() + BOOST_MINUTES * 60000).toISOString();
    const updated = await setBoost(message.id, until, req.uid);
    broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    res.json({ message: updated, balance: balanceOf(req.uid) });
  })
);

router.post(
  "/delete/:messageId",
  asyncRoute(async (req, res) => {
    const message = await getMessage(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Сообщение не найдено" });
    const chat = await getChat(message.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (chat.type !== "dm") {
      return res.status(400).json({ error: "За звёзды можно удалять только в личной переписке" });
    }
    if (message.senderId === req.uid) {
      return res.status(400).json({ error: "Своё сообщение удаляется бесплатно" });
    }

    const DELETE_COST = getPricing().starCosts.delete;
    if (!spendStars(req.uid, DELETE_COST)) {
      return res.status(402).json({ error: `Не хватает звёзд — нужно ${DELETE_COST}`, balance: balanceOf(req.uid) });
    }
    await deleteMessage(message.id);
    broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id: message.id });
    res.json({ ok: true, balance: balanceOf(req.uid) });
  })
);

router.post(
  "/transfer",
  asyncRoute(async (req, res) => {
    const toId = String(req.body?.userId ?? "");
    const amount = Math.floor(Number(req.body?.amount));

    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Укажите сумму больше нуля" });
    if (amount > 1_000_000) return res.status(400).json({ error: "Слишком большая сумма за один перевод" });
    if (!toId || toId === req.uid) return res.status(400).json({ error: "Себе переводить незачем" });

    const target = await getUser(toId);
    if (!target) return res.status(404).json({ error: "Получатель не найден" });
    if (target.isBot) return res.status(400).json({ error: "Боту звёзды не переведёшь" });
    if ((target.blockedUserIds ?? []).includes(req.uid)) return res.status(403).json({ error: "Пользователь заблокировал вас" });

    if (!transferStars(req.uid, toId, amount)) {
      return res.status(402).json({ error: `Не хватает звёзд: на балансе ${balanceOf(req.uid)} ⭐`, balance: balanceOf(req.uid) });
    }

    const me = await getUser(req.uid);
    const note = String(req.body?.note ?? "").trim().slice(0, 200);
    try {
      const chat = await findOrCreateDm(req.uid, toId);
      await sendMessageAndBroadcast(chat, req.uid, `⭐ Перевод: ${amount} ⭐${note ? `\n${note}` : ""}`);
    } catch {
    }

    res.json({ ok: true, amount, balance: balanceOf(req.uid), to: publicUser(target), from: me?.name ?? "" });
  })
);

module.exports = router;
module.exports.MAX_MESSAGE_PRICE = MAX_MESSAGE_PRICE;
