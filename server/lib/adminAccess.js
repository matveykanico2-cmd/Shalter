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

// Модератор не может банить, удалять и сбрасывать пароль тем, кто выше или
// наравне: иначе выданный раздел «moderation» превращался в захват главного
// админа (сброс пароля + снятие 2FA).
function outranks(me, target) {
  if (isPrimaryAdmin(me?.phone)) return !isPrimaryAdmin(target.phone);
  if (isAdminPhone(target.phone)) return false;
  if ((target.adminSections ?? []).length) return isAdminPhone(me?.phone);
  return true;
}

module.exports = { ADMIN_SECTIONS, hasAdminSection, isPrimaryAdmin, outranks };
