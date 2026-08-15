// Shared between registration (routes/auth.js) and profile edits
// (routes/users.js) so the same rules apply whichever path sets these
// fields, rather than each route re-implementing its own regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{10,15}$/;
// Letters/digits/underscore, 5-32 chars — same shape as Telegram's own
// username rules (a-z, 0-9, underscores; minimum length 5).
// Three characters, not five. Short handles are the scarce, desirable ones —
// which is the whole premise of the auction (server/routes/usernames.js): there
// is nothing to bid on if @abc can't exist.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function normalizePhone(phone) {
  return (phone ?? "").trim().replace(/[\s()-]/g, "");
}

module.exports = { EMAIL_RE, PHONE_RE, USERNAME_RE, normalizePhone };
