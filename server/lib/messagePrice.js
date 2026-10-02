const { getUser } = require("../data/users");
const { listContactsFor } = require("../data/contacts");
const { listMessages } = require("../data/messages");

async function messageCost(senderId, other, chatId) {
  const price = other?.messagePriceStars ?? 0;
  if (!price || !other || other.id === senderId) return { price: 0, mustPay: false };

  const theirContacts = await listContactsFor(other.id);
  if (theirContacts.some((c) => c.userId === senderId)) return { price, mustPay: false };

  const sender = await getUser(senderId);
  if (sender?.isPremium) return { price, mustPay: false };

  return { price, mustPay: true };
}

module.exports = { messageCost };
