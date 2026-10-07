const { listOwnersOf } = require("../data/contacts");
const { publicUser } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");

// Собеседники по личным чатам и ботам: их «Информация о чате» и список чатов
// показывают этот профиль, даже если он у них не в контактах.
async function dmPeersOf(userId) {
  const { listChatsForUser } = require("../data/chats");
  const peers = new Set();
  for (const chat of await listChatsForUser(userId)) {
    if (chat.type !== "dm" && chat.type !== "bot") continue;
    for (const id of chat.memberIds ?? []) if (id !== userId) peers.add(id);
  }
  return peers;
}

// Каждому — своя версия профиля: со своим именем для контакта и с учётом
// приватности (фото, «был(а) в сети») — как в publicUserFor.
function notifyProfileChanged(userId, user) {
  broadcastToUsers([userId], { type: "contact:updated", user: publicUser(user) });
  const { publicUserFor } = require("./privacyRules");
  dmPeersOf(userId)
    .catch((err) => {
      console.error("profile change peers lookup failed:", err);
      return new Set();
    })
    .then((peers) => {
      for (const ownerId of listOwnersOf(userId)) peers.add(ownerId);
      peers.delete(userId);
      for (const viewerId of peers) {
        publicUserFor(user, viewerId)
          .then((visible) => broadcastToUsers([viewerId], { type: "contact:updated", user: visible }))
          .catch((err) => console.error("profile change notify failed:", err));
      }
    });
}

module.exports = { notifyProfileChanged };
