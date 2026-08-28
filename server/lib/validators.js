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

// Дата рождения хранится в ISO (ГГГГ-ММ-ДД) — так её присылало поле-календарь,
// так присылает и поле с ручным вводом (public/js/components/dateField.js).
// Проверка здесь всё равно нужна: поле — это удобство, а не преграда, и запрос
// в обход него отправить может кто угодно.
//
// Календарём, а не «день до 31»: 31 февраля Date молча превращает в 3 марта, и
// в базе оказалась бы дата, которой человек не вводил.
function isValidBirthday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  return date.getTime() <= Date.now();
}

module.exports = { EMAIL_RE, PHONE_RE, USERNAME_RE, normalizePhone, isValidBirthday };
