const { grantPremiumDays, addReceivedGift, getUser } = require("../data/users");
const { claimSerial } = require("../data/giftIssues");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { addMessage } = require("../data/messages");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { publicUser } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");

function durationLabel(days) {
  if (days === 0) return null;
  if (days == null) return "Premium навсегда";
  return `Premium на ${days} дней`;
}

async function deliverGift({ gift, recipientId, fromId, announceFromId, background = null, anonymous = false, note = null }) {
  const sender = fromId ? await getUser(fromId) : null;
  const fromName = anonymous ? "Аноним" : sender?.name ?? null;
  // Аватар отправителя таким, каким его видит получатель (приватность фото), —
  // сохраняем в подарок, чтобы он был на полке и в чате, а не только буква.
  const { publicUserFor } = require("./privacyRules");
  const seen = !anonymous && sender ? await publicUserFor(sender, recipientId) : null;
  const fromAvatar = seen ? { fromAvatarColor: seen.avatarColor ?? null, fromAvatarImage: seen.avatarImage ?? null } : {};

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
    ...(note ? { note } : {}),
    fromId: fromId ?? null,
    fromName,
    ...fromAvatar,
    at: new Date().toISOString(),
    ...(serial != null ? { serial, supply: gift.supply } : {}),
  });

  broadcastToUsers([recipientId], { type: "self:updated", user: publicUser(await getUser(recipientId)) });

  const duration = durationLabel(gift.premiumDays);
  const serialLabel = serial != null ? ` (№${serial} из ${gift.supply})` : "";
  const giftAttachment = {
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
      ...(note ? { note } : {}),
      // Получателю анонимного подарка отправитель не раскрывается.
      fromId: anonymous ? null : fromId ?? null,
      fromName,
      ...fromAvatar,
      recipientId,
      ...(serial != null ? { serial, supply: gift.supply, exclusive: true } : {}),
    },
  };

  const announcerId = anonymous ? SYSTEM_BOT_ID : announceFromId;
  const chat = await findOrCreateDm(announcerId, recipientId);
  await sendMessageAndBroadcast(
    chat,
    announcerId,
    `🎁 Вам ${anonymous ? "анонимно " : ""}подарили: ${gift.emoji} «${gift.name}»${serialLabel}!${duration ? ` ${duration} активирован.` : ""}`,
    giftAttachment
  );

  // Анонимный подарок получателю объявляет бот, но запись нужна и в чате с
  // отправителем: после отправки открывается именно этот чат, и без записи он
  // выглядит пустым — кажется, что подарок никуда не ушёл. Запись видна только
  // отправителю (visibleToId, у получателя она сразу «удалена у себя»), иначе
  // она раскрыла бы его. Личка без видимых сообщений у получателя в списке не
  // появляется.
  if (anonymous && fromId) {
    const senderChat = await findOrCreateDm(fromId, recipientId);
    const message = await addMessage({
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId: senderChat.id,
      senderId: fromId,
      text: `🎁 Вы отправили анонимный подарок: ${gift.emoji} «${gift.name}»${serialLabel}!`,
      createdAt: new Date().toISOString(),
      readByIds: [fromId],
      visibleToId: fromId,
      deletedForIds: senderChat.memberIds.filter((id) => id !== fromId),
      type: giftAttachment.type,
      gift: { ...giftAttachment.gift, fromId },
    });
    broadcastToUsers([fromId], { type: "message:new", chatId: senderChat.id, message });
  }

  return { ok: true, serial, chat, duration };
}

module.exports = { deliverGift, durationLabel };
