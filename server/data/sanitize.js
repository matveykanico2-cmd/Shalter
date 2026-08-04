const { ADMIN_PHONE } = require("../config");

function publicUser(user) {
  const rest = { ...user };
  delete rest.passwordHash;
  delete rest.passwordSalt;
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
