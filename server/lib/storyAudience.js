const { getUser } = require("../data/users");
const { listContactsFor } = require("../data/contacts");
const { dmPartnerIds } = require("../data/chats");

// Кому видна история: те, кого автор сам добавил в контакты, и те, с кем у
// автора есть личная переписка (раньше только контакты — и историю не видели
// собеседники). Контакт считается со стороны автора: тот, кто просто добавил
// автора к себе, без его согласия истории не видит. Заблокированным автором —
// не видна. Должно совпадать с visibleAuthorIds (routes/stories.js).
async function audienceOf(authorId) {
  const author = await getUser(authorId);
  const blocked = new Set(author?.blockedUserIds ?? []);
  const contacts = (await listContactsFor(authorId)).map((c) => c.userId);
  return [...new Set([authorId, ...contacts, ...dmPartnerIds(authorId)])].filter((id) => !blocked.has(id));
}

module.exports = { audienceOf };
