// Contacts with a DM already open need a changed avatar/name/bio right away —
// otherwise the header kept showing the stale profile until the page was
// reloaded, since the client only snapshots the other side's profile once,
// when the chat is opened (see public/js/views/chatView.js's "contact:updated"
// listener). Includes the user themself: their own already-open self-chat
// ("Избранное") has the exact same staleness problem, and so does any other
// open session of theirs.
const { listOwnersOf } = require("../data/contacts");
const { publicUser } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");

function notifyProfileChanged(userId, user) {
  broadcastToUsers([userId, ...listOwnersOf(userId)], { type: "contact:updated", user: publicUser(user) });
}

module.exports = { notifyProfileChanged };
