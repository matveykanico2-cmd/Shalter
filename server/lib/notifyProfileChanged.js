const { listOwnersOf } = require("../data/contacts");
const { publicUser } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");

// Каждому — своя версия профиля: со своим именем для контакта и с учётом
// приватности (фото, «был(а) в сети») — как в publicUserFor.
function notifyProfileChanged(userId, user) {
  broadcastToUsers([userId], { type: "contact:updated", user: publicUser(user) });
  const { publicUserFor } = require("./privacyRules");
  for (const ownerId of listOwnersOf(userId)) {
    if (ownerId === userId) continue;
    publicUserFor(user, ownerId)
      .then((visible) => broadcastToUsers([ownerId], { type: "contact:updated", user: visible }))
      .catch((err) => console.error("profile change notify failed:", err));
  }
}

module.exports = { notifyProfileChanged };
