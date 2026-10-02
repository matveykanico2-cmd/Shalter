const { getUser, grantPremiumDays, grantAdsDays, grantBusinessDays } = require("../data/users");
const { getGift } = require("../data/gifts");
const { addStars, STAR_PACKS } = require("../data/stars");
const { PREMIUM_PLANS, BUSINESS_PLANS } = require("../config");
const { markOrderFulfilled } = require("../data/pendingOrders");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { deliverGift } = require("./deliverGift");

async function fulfillOrder(order) {
  const buyer = await getUser(order.userId);
  if (!buyer) return { ok: false, reason: "no_buyer" };

  if (order.kind === "gift") {
    const gift = getGift(order.giftId);
    if (!gift) return { ok: false, reason: "no_gift" };
    const recipientId = order.recipientId || order.userId;

    const result = await deliverGift({ gift, recipientId, fromId: order.userId, announceFromId: SYSTEM_BOT_ID });

    if (!result.ok) {
      const buyerChat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
      await sendMessageAndBroadcast(
        buyerChat,
        SYSTEM_BOT_ID,
        `😔 Оплата за «${gift.name}» получена, но последний экземпляр успели забрать раньше — все ${gift.supply} уже разобраны. Напишите администрации, чтобы вернуть средства или выбрать другой подарок.`
      );
      return { ok: false, reason: "sold_out" };
    }

    if (recipientId !== order.userId) {
      const buyerChat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
      await sendMessageAndBroadcast(buyerChat, SYSTEM_BOT_ID, `✅ Оплата получена — подарок «${gift.name}» доставлен.`);
    }
    await markOrderFulfilled(order.id);
    return { ok: true };
  }

  let text;
  if (order.kind === "premium") {
    const plan = Object.values(PREMIUM_PLANS).find((p) => p.priceRub === order.amountRub);
    if (!plan) return { ok: false, reason: "unknown_plan" };
    await grantPremiumDays(order.userId, plan.days);
    text = `🎉 Оплата получена! Вам выдан Shalter Premium на ${plan.label}. Спасибо, что поддерживаете проект.`;
  } else if (order.kind === "business") {
    const plan = Object.values(BUSINESS_PLANS).find((p) => p.priceRub === order.amountRub);
    if (!plan) return { ok: false, reason: "unknown_plan" };
    await grantBusinessDays(order.userId, plan.days);
    text = `🏢 Оплата получена! Вам выдан Shalter для бизнеса на ${plan.label}.`;
  } else if (order.kind === "ads") {
    await grantAdsDays(order.userId, 30);
    text = "📢 Оплата получена! Вам выдан кабинет рекламы на 30 дней. Настройте объявление в Настройки → Реклама.";
  } else if (order.kind === "stars") {
    const pack = STAR_PACKS.find((p) => p.priceRub === order.amountRub);
    if (!pack) return { ok: false, reason: "unknown_pack" };
    addStars(order.userId, pack.stars);
    text = `⭐ Оплата получена! Начислено ${pack.stars} звёзд.`;
  } else {
    return { ok: false, reason: "unknown_kind" };
  }

  const chat = await findOrCreateDm(SYSTEM_BOT_ID, order.userId);
  await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text);
  await markOrderFulfilled(order.id);
  return { ok: true };
}

module.exports = { fulfillOrder };
