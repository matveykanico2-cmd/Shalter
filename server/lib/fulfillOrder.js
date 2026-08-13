const { getUser, grantPremiumDays, grantAdsDays } = require("../data/users");
const { getGift } = require("../data/gifts");
const { markOrderFulfilled } = require("../data/pendingOrders");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { deliverGift } = require("./deliverGift");

// Turns a paid pending order into the thing that was bought — Premium days, an
// ads-cabinet subscription, or a delivered gift — and tells the buyer in their
// chat with the Shalter service bot.
//
// Only DonationAlerts' polled donation feed reaches this: a plain bank transfer
// has no order to clear, since the admin grants that purchase directly from the
// buyer's profile (public/js/components/adminUserPanel.js). Kept as its own
// module rather than folded back into lib/donationAlerts.js because it's the
// single place that claims a limited gift's serial — worth being findable
// rather than buried in the middle of the OAuth/polling plumbing.
//
// Idempotence is the *caller's* job: check order.status === "pending" before
// calling, since only the caller knows whether it's replaying a feed item.
async function fulfillOrder(order) {
  const buyer = await getUser(order.userId);
  if (!buyer) return { ok: false, reason: "no_buyer" };

  if (order.kind === "gift") {
    const gift = getGift(order.giftId);
    if (!gift) return { ok: false, reason: "no_gift" };
    const recipientId = order.recipientId || order.userId;

    const result = await deliverGift({ gift, recipientId, fromId: order.userId, announceFromId: SYSTEM_BOT_ID });

    if (!result.ok) {
      // The last copy sold between this buyer paying and the payment
      // clearing (a real race for a supply-of-1 item). Their money has
      // already arrived, so the one thing not to do is fail silently: tell
      // them, and leave the order *unfulfilled* so it's still visible as
      // owed rather than marked done.
      const buyerChat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
      await sendMessageAndBroadcast(
        buyerChat,
        SYSTEM_BOT_ID,
        `😔 Оплата за «${gift.name}» получена, но последний экземпляр успели забрать раньше — все ${gift.supply} уже разобраны. Напишите администрации, чтобы вернуть средства или выбрать другой подарок.`
      );
      return { ok: false, reason: "sold_out" };
    }

    // deliverGift already posted the gift card in the recipient's chat; the
    // buyer (when gifting someone else) gets a separate plain confirmation so
    // both sides see something.
    if (recipientId !== order.userId) {
      const buyerChat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
      await sendMessageAndBroadcast(buyerChat, SYSTEM_BOT_ID, `✅ Оплата получена — подарок «${gift.name}» доставлен.`);
    }
    await markOrderFulfilled(order.id);
    return { ok: true };
  }

  let text;
  if (order.kind === "premium") {
    await grantPremiumDays(order.userId, 30);
    text = "🎉 Оплата получена! Вам выдан Shalter Premium на 30 дней. Спасибо, что поддерживаете проект.";
  } else if (order.kind === "ads") {
    await grantAdsDays(order.userId, 30);
    text = "📢 Оплата получена! Вам выдан кабинет рекламы на 30 дней. Настройте объявление в Настройки → Реклама.";
  } else {
    return { ok: false, reason: "unknown_kind" };
  }

  const chat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
  await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
  await markOrderFulfilled(order.id);
  return { ok: true };
}

module.exports = { fulfillOrder };
