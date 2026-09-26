// The one place a gift actually lands on someone's account. Three separate
// paths lead here — the admin gifting instantly (routes/gifts.js's
// /request), the admin confirming a manual transfer (/deliver), and a
// DonationAlerts payment clearing (lib/donationAlerts.js's fulfillOrder) —
// and before this module existed each one repeated the grant/shelf/announce
// steps itself. That was survivable while gifts were unlimited; with limited
// gifts it isn't, because a path that forgets to claim a serial would hand
// out an untracked copy and quietly break the "only 10 will ever exist"
// promise the shop makes.
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

// Delivers one copy of `gift` to `recipientId`, announced in the DM between
// `announceFromId` and the recipient.
//
// Returns { ok: false, reason: "sold_out" } when a limited gift's last copy
// is already gone — deliberately a returned value rather than a thrown
// error, because every caller has a different thing to do about it (tell
// the buyer, refund-by-hand, log it) and none of them should treat it as a
// crash. Nothing is granted in that case.
async function deliverGift({ gift, recipientId, fromId, announceFromId, background = null, anonymous = false }) {
  // Who it's from, resolved once and stamped onto both the message card and the
  // profile shelf. A gift with no visible sender is just an object appearing out
  // of nowhere — the whole point is that someone gave it to you.
  //
  // Анонимно (Premium, см. routes/gifts.js): получателю показываем «Аноним» и
  // доставляем от служебного аккаунта Shalter (не из DM с отправителем, иначе
  // отправитель тут же раскроется). Но реальный fromId ниже всё равно пишется в
  // запись подарка — то есть в базе данных остаётся, кто на самом деле подарил.
  const sender = fromId ? await getUser(fromId) : null;
  const fromName = anonymous ? "Аноним" : sender?.name ?? null;

  let serial = null;
  if (gift.supply) {
    serial = claimSerial(gift, recipientId, fromId ?? null);
    if (serial == null) return { ok: false, reason: "sold_out" };
  }

  if (gift.premiumDays !== 0) await grantPremiumDays(recipientId, gift.premiumDays);
  await addReceivedGift(recipientId, {
    // The catalogue id and star price are stored alongside the display fields so
    // the gift can still be converted back into stars after the catalogue entry
    // itself changes or is removed (routes/gifts.js's /convert).
    giftId: gift.id,
    priceRub: gift.priceRub,
    priceStars: gift.priceStars,
    emoji: gift.emoji,
    name: gift.name,
    // Гифка с уже вырезанным фоном (server/lib/giftMedia.js), если админ её
    // прикрепил при выпуске — public/js/lib/giftTraits.js's renderGiftArt
    // рисует её вместо анимации по эмодзи.
    mediaUrl: gift.mediaUrl,
    // Нарисованная в аниматоре сцена (public/js/lib/customScene.js) — так же
    // рисуется вместо эмодзи. Personal-подарок (нарисованный пользователем)
    // бесплатный: помечаем его, чтобы он не обменивался на звёзды (routes/
    // gifts.js's /convert) — иначе бесплатный подарок стал бы фабрикой звёзд.
    scene: gift.scene,
    ...(gift.ownerId || (gift.scene && !gift.priceStars) ? { custom: true } : {}),
    // Фон, выбранный отправителем при отправке (lib/giftBackground.js) —
    // рисуется за подарком и в чате, и на полке профиля.
    ...(background ? { background } : {}),
    // Анонимный подарок: пометка для отображения. fromId ниже — реальный,
    // остаётся в базе (кто подарил), даже когда получателю показан «Аноним».
    ...(anonymous ? { anon: true } : {}),
    fromId: fromId ?? null,
    fromName,
    at: new Date().toISOString(),
    // Only limited gifts carry these — the profile shelf uses them to show
    // the "#3 из 10" badge, and their absence is what marks an ordinary gift.
    ...(serial != null ? { serial, supply: gift.supply } : {}),
  });

  // The gift shelf and (for a Premium-granting gift) the Premium badge both
  // live in the recipient's client-side state (state.js's `user`), which
  // otherwise only learns about a change like this by re-fetching on login —
  // the chat message below lands instantly, but a profile already open (their
  // own, mid-session) stayed stale until a reload. Same fix as premium.js's
  // /grant: push the fresh profile over the socket.
  broadcastToUsers([recipientId], { type: "self:updated", user: publicUser(await getUser(recipientId)) });

  const duration = durationLabel(gift.premiumDays);
  const serialLabel = serial != null ? ` (№${serial} из ${gift.supply})` : "";
  // Анонимный подарок приходит от служебного аккаунта Shalter, а не из DM с
  // отправителем, — иначе диалог сам выдал бы, кто подарил.
  const announcerId = anonymous ? SYSTEM_BOT_ID : announceFromId;
  const chat = await findOrCreateDm(announcerId, recipientId);
  await sendMessageAndBroadcast(
    chat,
    announcerId,
    `🎁 Вам ${anonymous ? "анонимно " : ""}подарили: ${gift.emoji} «${gift.name}»${serialLabel}!${duration ? ` ${duration} активирован.` : ""}`,
    {
      type: "gift",
      gift: {
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
        ...(serial != null ? { serial, supply: gift.supply, exclusive: true } : {}),
      },
    }
  );

  return { ok: true, serial, chat, duration };
}

module.exports = { deliverGift, durationLabel };
