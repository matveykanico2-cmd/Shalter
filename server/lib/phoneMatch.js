// Turns a phone number written however a person's address book happens to
// store it into one canonical key, so "+7 (999) 123-45-67", "8 999 123 45 67"
// and "79991234567" all match the same account.
//
// Deliberately narrow: digits only, plus the one national-prefix rule that
// actually matters for this app's users (Russia's 8 → 7). It does NOT try to
// guess a country for a bare 10-digit number — that's how contact matching
// starts connecting people to strangers who happen to share the last digits of
// their number in a different country.
function phoneKey(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // 8XXXXXXXXXX is how a Russian number is normally written down locally; the
  // same subscriber is 7XXXXXXXXXX internationally.
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

// Builds phoneKey -> user for every account that is discoverable by the given
// viewer. `canDiscover` decides that per user, so the privacy rule lives with
// the route rather than in here.
function indexUsersByPhone(users, canDiscover) {
  const index = new Map();
  for (const user of users) {
    if (user.isBot) continue;
    if (!canDiscover(user)) continue;
    const key = phoneKey(user.phone);
    if (key) index.set(key, user);
  }
  return index;
}

module.exports = { phoneKey, indexUsersByPhone };
