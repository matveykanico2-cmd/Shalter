const { getUser } = require("../data/users");
const { listContactsFor } = require("../data/contacts");
const { listMessages } = require("../data/messages");

// Сколько стоит написать этому человеку — один ответ на двоих.
//
// Правило живёт здесь, а не в маршруте отправки, потому что знать его надо в
// двух местах сразу: при отправке (списать звёзды) и при открытии чата (сказать
// заранее, во что обойдётся сообщение). Пока расчёт был вписан в отправку,
// поле ввода молчало, и о цене человек узнавал только из отказа.
//
// Четыре способа писать бесплатно, и все означают «это уже не холодное письмо»:
//   1) вы у получателя в контактах — он сам вас добавил;
//   2) он вам хоть раз ответил — дальше переписка бесплатна в обе стороны;
//   3) у вас Premium — подписка покупается в том числе ради этого;
//   4) вы пишете сами себе (заметки).
async function messageCost(senderId, other, chatId) {
  const price = other?.messagePriceStars ?? 0;
  if (!price || !other || other.id === senderId) return { price: 0, mustPay: false };

  const theirContacts = await listContactsFor(other.id);
  if (theirContacts.some((c) => c.userId === senderId)) return { price, mustPay: false };

  const sender = await getUser(senderId);
  if (sender?.isPremium) return { price, mustPay: false };

  const everReplied = (await listMessages(chatId, other.id)).some((m) => m.senderId === other.id);
  return { price, mustPay: !everReplied };
}

module.exports = { messageCost };
