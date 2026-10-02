const { getUser, grantPremiumDays, grantAdsDays, grantBusinessDays } = require("../data/users");
const { getGift } = require("../data/gifts");
const { addStars } = require("../data/stars");
const { getPricing } = require("../data/pricing");
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

  // Что купили — из снимка в заказе (meta). Заказы, созданные до его
  // появления, сопоставляются по сумме с текущими ценами, как раньше.
  const pricing = getPricing();
  const meta = order.meta ?? {};
  let text;
  if (order.kind === "premium") {
    const plan = meta.days ? meta : pricing.premiumPlans.find((p) => p.priceRub === order.amountRub);
    if (!plan) return { ok: false, reason: "unknown_plan" };
    await grantPremiumDays(order.userId, plan.days);
    text = `🎉 Оплата получена! Вам выдан Shalter Premium на ${plan.label}. Спасибо, что поддерживаете проект.`;
  } else if (order.kind === "business") {
    const plan = meta.days ? meta : pricing.businessPlans.find((p) => p.priceRub === order.amountRub);
    if (!plan) return { ok: false, reason: "unknown_plan" };
    await grantBusinessDays(order.userId, plan.days);
    text = `🏢 Оплата получена! Вам выдан Shalter для бизнеса на ${plan.label}.`;
  } else if (order.kind === "ads") {
    const days = meta.days ?? pricing.ads.days;
    await grantAdsDays(order.userId, days);
    text = `📢 Оплата получена! Вам выдан кабинет рекламы на ${days} дней. Настройте объявление в Настройки → Реклама.`;
  } else if (order.kind === "stars") {
    const pack = meta.stars ? meta : pricing.starPacks.find((p) => p.priceRub === order.amountRub);
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
