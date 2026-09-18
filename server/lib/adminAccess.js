const { ADMIN_PHONE, isAdminPhone } = require("../config");

// The admin screens that can be handed out individually — one id per entry
// in SECTIONS' adminOnly group in public/js/views/settings/index.js. Keep
// this list and that one in sync: an id here with nothing on the client
// side is dead, and a client section without an id here can't be granted.
const ADMIN_SECTIONS = ["moderation", "server", "giftshop", "donations", "legal"];

// A full admin (isAdminPhone — the phone in ADMIN_PHONE or listed in
// PREMIUM_ADMIN_PHONES) already has every section; a partial admin only has
// the ones the primary admin picked out for them (user.adminSections).
function hasAdminSection(user, section) {
  if (!user) return false;
  if (isAdminPhone(user.phone)) return true;
  return (user.adminSections ?? []).includes(section);
}

// Only the single account holding ADMIN_PHONE — not the extra numbers in
// PREMIUM_ADMIN_PHONES — can hand out partial access. Those extra numbers
// are meant for people who are themselves full admins (see server/config.js);
// letting them also re-grant pieces of it to others would make "who can grant
// access" impossible to answer by reading one env var.
function isPrimaryAdmin(phone) {
  return !!ADMIN_PHONE && phone === ADMIN_PHONE;
}

module.exports = { ADMIN_SECTIONS, hasAdminSection, isPrimaryAdmin };
