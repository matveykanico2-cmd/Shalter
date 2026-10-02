const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

function sanitizeGiftBackground(bg) {
  if (!bg || typeof bg !== "object") return null;
  const from = hex(bg.from);
  const to = hex(bg.to);
  if (!from || !to) return null;
  return { from, to };
}

module.exports = { sanitizeGiftBackground };
