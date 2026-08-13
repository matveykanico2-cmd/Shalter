const { ADMIN_PHONE } = require("../config");

function publicUser(user) {
  const rest = { ...user };
  delete rest.passwordHash;
  delete rest.passwordSalt;
  // The ban *reason* is between the banned account and the admin — it can
  // quote a report's free-text details, so it must not ride along on every
  // profile lookup the way isBanned (a plain flag) does. The account itself
  // gets it on the login screen (routes/auth.js) and the admin gets it from
  // routes/admin.js's /moderation; nobody else needs it.
  // `safetyLabel` deliberately stays: it's meant to be seen by everyone (see
  // server/db.js's comment on the column).
  delete rest.banReason;
  delete rest.bannedAt;
  // Computed, not stored — "Developer" is just "whoever currently holds
  // ADMIN_PHONE" (same convention as the Premium-granting permission check
  // in server/routes/premium.js), not a role stored on the row. Exposing a
  // plain boolean here (rather than making every client compare phone
  // numbers itself) also means it works even when the user's own privacy
  // settings hide their phone number from others.
  rest.isDeveloper = user.phone === ADMIN_PHONE || undefined;
  return rest;
}

function publicUsers(users) {
  return users.map(publicUser);
}

module.exports = { publicUser, publicUsers };
