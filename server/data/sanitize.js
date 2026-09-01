const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { SYSTEM_BOT_ID } = require("./systemBot");

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
  // The 2FA secret and the recovery-code hashes are credentials — they must
  // never reach a client, not even the account's own. `twoFactorEnabled`
  // (derived, a plain boolean) is what the UI actually needs, and it stays.
  delete rest.totpSecret;
  delete rest.totpRecoveryCodes;
  // Облачный пароль — такие же учётные данные: его хэш и соль не должны уходить
  // никому, включая сам аккаунт. Здесь список «что убрать», а не «что оставить»,
  // поэтому каждое новое поле с секретом нужно вычёркивать вручную — забыть
  // строку значит разослать хэш вместе с каждым профилем.
  delete rest.cloudPasswordHash;
  delete rest.cloudPasswordSalt;
  // Подсказка тоже лишняя в общем ответе: её показывают только на экране ввода
  // облачного пароля, и отдаёт её отдельный маршрут по билету входа. В профиле
  // она была бы подсказкой к чужому паролю для всякого, кто открыл профиль.
  delete rest.cloudPasswordHint;
  // The e-mail address is the account's own business — it was going out with
  // every profile lookup and every search hit, so anyone could read anyone's
  // address by opening their profile. Nothing in the app shows other people's
  // e-mail; it was simply never removed. The account's own responses use
  // selfUser() below, which keeps it.
  delete rest.email;
  // How many stars someone has is their business. messagePriceStars stays:
  // whoever is about to write to them has to know what it will cost.
  delete rest.stars;
  // Computed, not stored — "Developer" is just "whoever currently holds
  // ADMIN_PHONE" (same convention as the Premium-granting permission check
  // in server/routes/premium.js), not a role stored on the row. Exposing a
  // plain boolean here (rather than making every client compare phone
  // numbers itself) also means it works even when the user's own privacy
  // settings hide their phone number from others.
  rest.isDeveloper = isAdminPhone(user.phone) || undefined;
  // Тот же аккаунт всегда носит и галочку — выданную, а не проставленную
  // руками в базе. Так она есть сразу и везде: в поиске, в профиле, в списке
  // чатов и в шапке разговора, — переживает пересоздание базы и переезд на
  // другой сервер, и не требует доступа к консоли, чтобы её поставить.
  // Снять её с этого номера нельзя — и это осознанно, а не недосмотр:
  // rowToUser отдаёт isVerified как true либо undefined (никогда false), так
  // что «снять галочку» в админке вернёт строку к undefined, и подстановка
  // сработает снова. Чтобы её убрать, номер должен перестать быть ADMIN_PHONE.
  rest.isVerified = user.isVerified ?? (isAdminPhone(user.phone) || undefined);
  // Marks the Shalter service account, so the client can present its chat as
  // one-way instead of offering a composer the server will refuse.
  rest.isServiceBot = user.id === SYSTEM_BOT_ID || undefined;
  return rest;
}

// The same object as publicUser, plus the fields an account may see about
// itself: currently the e-mail address. Used by every response that hands you
// *your own* record — session, login, register, account switching, settings.
function selfUser(user) {
  return { ...publicUser(user), email: user.email ?? undefined };
}

function publicUsers(users) {
  return users.map(publicUser);
}

module.exports = { publicUser, selfUser, publicUsers };
