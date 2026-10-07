const { getUser } = require("../data/users");
const { publicUserFor } = require("./privacyRules");

// Аватар отправителя у полученных подарков — актуальный, глазами того, кто
// смотрит: с учётом приватности фото отправителя и того, как он записан у
// смотрящего в контактах. Анонимные подарки не раскрываем.
async function withGiftSenders(gifts, viewerId) {
  if (!Array.isArray(gifts) || !gifts.length) return gifts;
  const senders = new Map();
  const senderOf = async (id) => {
    if (!senders.has(id)) {
      const user = await getUser(id);
      senders.set(id, user ? await publicUserFor(user, viewerId) : null);
    }
    return senders.get(id);
  };
  return Promise.all(
    gifts.map(async (g) => {
      if (g.anon || !g.fromId) return g;
      const sender = await senderOf(g.fromId);
      if (!sender) return g;
      return {
        ...g,
        fromName: sender.name ?? g.fromName,
        fromAvatarColor: sender.avatarColor ?? g.fromAvatarColor ?? null,
        fromAvatarImage: sender.avatarImage ?? null,
      };
    })
  );
}

// Пользователь с подарками, у которых проставлены аватары отправителей.
async function withGiftSendersOn(user, viewerId) {
  if (!user || !Array.isArray(user.giftsReceived)) return user;
  return { ...user, giftsReceived: await withGiftSenders(user.giftsReceived, viewerId) };
}

module.exports = { withGiftSenders, withGiftSendersOn };
