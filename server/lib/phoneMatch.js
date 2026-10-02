function phoneKey(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

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
