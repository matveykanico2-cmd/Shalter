const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getUser, findUserByPhone } = require("../data/users");
const { getChat, listChatsForUser } = require("../data/chats");
const { getMessage, deleteMessage, setBoost } = require("../data/messages");
const { balanceOf, addStars, spendStars, setMessagePrice, transferStars } = require("../data/stars");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const { publicUser } = require("../data/sanitize");

// Stars — the in-app currency.
//
// Bought the same way everything else here is: a real transfer to the admin, who
// confirms it by hand (see AGENTS.md — there is no payment gateway). The packs
// below span the 1₽–100₽ range, with the bigger ones giving progressively more
// stars per ruble, which is the ordinary shape of this kind of thing.

const STAR_PACKS = [
  { id: "stars_10", stars: 10, priceRub: 1 },
  { id: "stars_60", stars: 60, priceRub: 5 },
  { id: "stars_130", stars: 130, priceRub: 10 },
  { id: "stars_350", stars: 350, priceRub: 25 },
  { id: "stars_750", stars: 750, priceRub: 50 },
  { id: "stars_1600", stars: 1600, priceRub: 100 },
];

// What the paid actions cost. Deliberately small next to the pack sizes: these
// are meant to be used, not hoarded.
const BOOST_COST = 10;
const BOOST_MINUTES = 60;
const DELETE_COST = 5;
// The ceiling on what an account may charge strangers to write to it. Without
// one, "paid DMs" becomes "nobody can ever reach me", which is what the block
// list is for.
const MAX_MESSAGE_PRICE = 90000;

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    res.json({
      balance: balanceOf(req.uid),
      userId: req.uid,
      messagePriceStars: me?.messagePriceStars ?? 0,
      packs: STAR_PACKS,
      costs: { boost: BOOST_COST, boostMinutes: BOOST_MINUTES, delete: DELETE_COST, maxMessagePrice: MAX_MESSAGE_PRICE },
    });
  })
);

// "I want to buy stars" — drops the request into the admin's DM, exactly like a
// Premium or gift purchase. The admin credits the balance from the buyer's
// profile once the transfer arrives.
router.post(
  "/request",
  asyncRoute(async (req, res) => {
    const pack = STAR_PACKS.find((p) => p.id === req.body?.packId);
    if (!pack) return res.status(404).json({ error: "Такого набора нет" });

    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin) return res.status(503).json({ error: "Администрация Shalter ещё не зарегистрирована в приложении" });
    if (admin.id === req.uid) {
      // The admin has nobody to ask, so their own purchase is instant and free —
      // same shortcut the gift shop takes.
      addStars(req.uid, pack.stars);
      return res.json({ balance: balanceOf(req.uid), granted: true });
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

// Admin credits (or debits) a balance — the other half of the transfer flow,
// reachable from the per-user admin panel on a profile.
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

// The price this account charges strangers per DM. 0 turns it off.
router.post(
  "/price",
  asyncRoute(async (req, res) => {
    const price = Math.trunc(Number(req.body?.stars));
    if (!Number.isFinite(price) || price < 0 || price > MAX_MESSAGE_PRICE) {
      return res.status(400).json({ error: `Цена — от 0 до ${MAX_MESSAGE_PRICE} звёзд` });
    }
    setMessagePrice(req.uid, price);
    // Кто уже держит открытой переписку с вами, узнаёт новую цену сразу, а не
    // при следующем заходе в чат: composer.js читает её из paidMessages, а это
    // поле сервер кладёт только при открытии чата (lib/messagePrice.js) —
    // без этого сообщения открытый у собеседника композитор молчал бы о
    // цене до перезахода.
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

// Boost: highlights a message and keeps it at the top of the chat for an hour.
router.post(
  "/boost/:messageId",
  asyncRoute(async (req, res) => {
    const message = await getMessage(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Сообщение не найдено" });
    const chat = await getChat(message.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    if (!spendStars(req.uid, BOOST_COST)) {
      return res.status(402).json({ error: `Не хватает звёзд — нужно ${BOOST_COST}`, balance: balanceOf(req.uid) });
    }
    const until = new Date(Date.now() + BOOST_MINUTES * 60000).toISOString();
    const updated = await setBoost(message.id, until, req.uid);
    broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    res.json({ message: updated, balance: balanceOf(req.uid) });
  })
);

// Paid delete: clears someone else's message out of a conversation.
//
// Restricted to one-to-one chats on purpose. In a group or channel this would be
// "anyone with stars can erase anything anybody said", which is moderation sold
// to the highest bidder; between two people it's just tidying a conversation you
// are half of. Group/channel moderation stays with admins, unpaid.
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

    if (!spendStars(req.uid, DELETE_COST)) {
      return res.status(402).json({ error: `Не хватает звёзд — нужно ${DELETE_COST}`, balance: balanceOf(req.uid) });
    }
    await deleteMessage(message.id);
    broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id: message.id });
    res.json({ ok: true, balance: balanceOf(req.uid) });
  })
);

// Перевод звёзд другому человеку.
//
// Отдельно от покупки и от платных сообщений: там звёзды списываются за
// действие, здесь просто передаются из рук в руки — как подарок или как
// расчёт за что-то, о чём договорились в переписке.
//
// Списание и зачисление идут одной транзакцией (data/stars.js), поэтому
// «списалось, но не дошло» невозможно даже при сбое посередине.
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

    if (!transferStars(req.uid, toId, amount)) {
      return res.status(402).json({ error: `Не хватает звёзд: на балансе ${balanceOf(req.uid)} ⭐`, balance: balanceOf(req.uid) });
    }

    // Получателю — сообщение в личный чат, иначе перевод остаётся незамеченным:
    // баланс молча вырос, а кто и за что прислал — неизвестно.
    const me = await getUser(req.uid);
    const note = String(req.body?.note ?? "").trim().slice(0, 200);
    try {
      const chat = await findOrCreateDm(req.uid, toId);
      await sendMessageAndBroadcast(chat, req.uid, `⭐ Перевод: ${amount} ⭐${note ? `\n${note}` : ""}`);
    } catch {
      // Сообщение — вежливость, а не часть перевода: звёзды уже переданы.
    }

    res.json({ ok: true, amount, balance: balanceOf(req.uid), to: publicUser(target), from: me?.name ?? "" });
  })
);

module.exports = router;
module.exports.STAR_PACKS = STAR_PACKS;
module.exports.MAX_MESSAGE_PRICE = MAX_MESSAGE_PRICE;
