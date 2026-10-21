const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{10,15}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function normalizePhone(phone) {
  return (phone ?? "").trim().replace(/[\s()-]/g, "");
}

// Дата рождения «ДД.ММ.ГГГГ» (как просит форма) или «ГГГГ-ММ-ДД» (input type=date) →
// «ГГГГ-ММ-ДД», как она хранится. Невалидная — null.
function normalizeBirthday(value) {
  const raw = String(value ?? "").trim();
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  const iso = ru ? `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}` : raw;
  return isValidBirthday(iso) ? iso : null;
}

function isValidBirthday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  return date.getTime() <= Date.now();
}

module.exports = { EMAIL_RE, PHONE_RE, USERNAME_RE, normalizePhone, isValidBirthday, normalizeBirthday };
