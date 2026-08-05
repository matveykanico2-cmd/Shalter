// Auto-inserts spaces while typing a phone number — "+7 978 182 75 02"
// (grouped 1-3-3-2-2, matching the "+7 999 123-45-67" placeholder shown
// throughout the login/register forms) instead of one long run of digits.
// Purely cosmetic: the server already strips spaces/dashes/parens before
// storing/comparing (see normalizePhone in server/routes/auth.js), so the
// formatted string is safe to submit as-is.
export function formatPhoneInput(raw) {
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (!digits) return hasPlus ? "+" : "";
  const groups = [digits.slice(0, 1), digits.slice(1, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)].filter(Boolean);
  return (hasPlus ? "+" : "") + groups.join(" ");
}
