const { listOwnersOf } = require("../data/contacts");
const { publicUser } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");

function notifyProfileChanged(userId, user) {
  broadcastToUsers([userId, ...listOwnersOf(userId)], { type: "contact:updated", user: publicUser(user) });
}

module.exports = { notifyProfileChanged };
