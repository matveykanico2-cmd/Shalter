// The one place a gift actually lands on someone's account. Three separate
// paths lead here — the admin gifting instantly (routes/gifts.js's
// /request), the admin confirming a manual transfer (/deliver), and a
// DonationAlerts payment clearing (lib/donationAlerts.js's fulfillOrder) —
// and before this module existed each one repeated the grant/shelf/announce
// steps itself. That was survivable while gifts were unlimited; with limited
// gifts it isn't, because a path that forgets to claim a serial would hand
// out an untracked copy and quietly break the "only 10 will ever exist"
// promise the shop makes.
const { grantPremiumDays, addReceivedGift } = require("../data/users");
const { claimSerial } = require("../data/giftIssues");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");

function durationLabel(days) {
  if (days === 0) return null;
  if (days == null) return "Premium навсегда";
  return `Premium на ${days} дней`;
}

// Delivers one copy of `gift` to `recipientId`, announced in the DM between
// `announceFromId` and the recipient.
//
// Returns { ok: false, reason: "sold_out" } when a limited gift's last copy
// is already gone — deliberately a returned value rather than a thrown
// error, because every caller has a different thing to do about it (tell
// the buyer, refund-by-hand, log it) and none of them should treat it as a
// crash. Nothing is granted in that case.
async function deliverGift({ gift, recipientId, fromId, announceFromId }) {
  let serial = null;
  if (gift.supply) {
    serial = claimSerial(gift, recipientId, fromId ?? null);
    if (serial == null) return { ok: false, reason: "sold_out" };
  }

  if (gift.premiumDays !== 0) await grantPremiumDays(recipientId, gift.premiumDays);
  await addReceivedGift(recipientId, {
    emoji: gift.emoji,
    name: gift.name,
    fromId: fromId ?? null,
    at: new Date().toISOString(),
    // Only limited gifts carry these — the profile shelf uses them to show
    // the "#3 из 10" badge, and their absence is what marks an ordinary gift.
    ...(serial != null ? { serial, supply: gift.supply } : {}),
  });

  const duration = durationLabel(gift.premiumDays);
  const serialLabel = serial != null ? ` (№${serial} из ${gift.supply})` : "";
  const chat = await findOrCreateDm(announceFromId, recipientId);
  await sendMessageAndBroadcast(
    chat,
    announceFromId,
    `🎁 Вам подарили: ${gift.emoji} «${gift.name}»${serialLabel}!${duration ? ` ${duration} активирован.` : ""}`,
    {
      type: "gift",
      gift: {
        emoji: gift.emoji,
        name: gift.name,
        priceRub: gift.priceRub,
        premiumDays: gift.premiumDays,
        durationLabel: duration,
        ...(serial != null ? { serial, supply: gift.supply, exclusive: true } : {}),
      },
    }
  );

  return { ok: true, serial, chat, duration };
}

module.exports = { deliverGift, durationLabel };
