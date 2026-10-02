const { ADMIN_PHONE, isAdminPhone } = require("../config");

const ADMIN_SECTIONS = ["moderation", "server", "giftshop", "emojicatalog", "donations", "pricing", "legal"];

function hasAdminSection(user, section) {
  if (!user) return false;
  if (isAdminPhone(user.phone)) return true;
  return (user.adminSections ?? []).includes(section);
}

function isPrimaryAdmin(phone) {
  return !!ADMIN_PHONE && phone === ADMIN_PHONE;
}

module.exports = { ADMIN_SECTIONS, hasAdminSection, isPrimaryAdmin };
