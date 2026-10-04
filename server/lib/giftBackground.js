const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SYMBOL_RE = /^[a-z0-9]{1,32}$/;
const hex = (v) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

// Фон подарка как в tweb: два цвета (центр и край) обязательны, цвет узора и
// символ — необязательные, чтобы подарки, отправленные без выбора фона, оставались валидными.
function sanitizeGiftBackground(bg) {
  if (!bg || typeof bg !== "object") return null;
  const from = hex(bg.from);
  const to = hex(bg.to);
  if (!from || !to) return null;
  const pattern = hex(bg.pattern);
  const symbol = typeof bg.symbol === "string" && SYMBOL_RE.test(bg.symbol) ? bg.symbol : null;
  return { from, to, ...(pattern ? { pattern } : {}), ...(symbol ? { symbol } : {}) };
}

module.exports = { sanitizeGiftBackground };