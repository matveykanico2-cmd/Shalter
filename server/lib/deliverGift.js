const { grantPremiumDays, addReceivedGift, getUser } = require("../data/users");
const { claimSerial } = require("../data/giftIssues");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { publicUser } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");

function durationLabel(days) {
  if (days === 0) return null;
  if (days == null) return "Premium навсегда";
  return `Premium на ${days} дней`;
}

async function deliverGift({ gift, recipientId, fromId, announceFromId, background = null, anonymous = false }) {
  const sender = fromId ? await getUser(fromId) : null;
  const fromName = anonymous ? "Аноним" : sender?.name ?? null;

  let serial = null;
  if (gift.supply) {
    serial = claimSerial(gift, recipientId, fromId ?? null);
    if (serial == null) return { ok: false, reason: "sold_out" };
  }

  if (gift.premiumDays !== 0) await grantPremiumDays(recipientId, gift.premiumDays);
  await addReceivedGift(recipientId, {
    giftId: gift.id,
    priceRub: gift.priceRub,
    priceStars: gift.priceStars,
    emoji: gift.emoji,
    name: gift.name,
    mediaUrl: gift.mediaUrl,
    scene: gift.scene,
    ...(gift.ownerId || (gift.scene && !gift.priceStars) ? { custom: true } : {}),
    ...(background ? { background } : {}),
    ...(anonymous ? { anon: true } : {}),
    fromId: fromId ?? null,
    fromName,
    at: new Date().toISOString(),
    ...(serial != null ? { serial, supply: gift.supply } : {}),
  });

  broadcastToUsers([recipientId], { type: "self:updated", user: publicUser(await getUser(recipientId)) });

  const duration = durationLabel(gift.premiumDays);
  const serialLabel = serial != null ? ` (№${serial} из ${gift.supply})` : "";
  const announcerId = anonymous ? SYSTEM_BOT_ID : announceFromId;
  const chat = await findOrCreateDm(announcerId, recipientId);
  await sendMessageAndBroadcast(
    chat,
    announcerId,
    `🎁 Вам ${anonymous ? "анонимно " : ""}подарили: ${gift.emoji} «${gift.name}»${serialLabel}!${duration ? ` ${duration} активирован.` : ""}`,
    {
      type: "gift",
      gift: {
        giftId: gift.id,
        emoji: gift.emoji,
        name: gift.name,
        priceRub: gift.priceRub,
        premiumDays: gift.premiumDays,
        durationLabel: duration,
        priceStars: gift.priceStars,
        mediaUrl: gift.mediaUrl,
        scene: gift.scene,
        ...(gift.ownerId || (gift.scene && !gift.priceStars) ? { custom: true } : {}),
        ...(background ? { background } : {}),
        ...(anonymous ? { anon: true } : {}),
        fromId: fromId ?? null,
        fromName,
        recipientId,
        ...(serial != null ? { serial, supply: gift.supply, exclusive: true } : {}),
      },
    }
  );

  return { ok: true, serial, chat, duration };
}

module.exports = { deliverGift, durationLabel };
