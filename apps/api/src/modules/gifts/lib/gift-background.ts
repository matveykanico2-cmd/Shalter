import type { GiftBackground } from "../model/domain.js";

// Фон подарка как в tweb: два цвета (центр и край) обязательны, цвет узора и символ — необязательные.
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SYMBOL_RE = /^[a-z0-9]{1,32}$/;
const hex = (v: unknown) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

export function sanitizeGiftBackground(bg: unknown): GiftBackground | null {
  if (!bg || typeof bg !== "object") return null;
  const raw = bg as Record<string, unknown>;
  const from = hex(raw.from);
  const to = hex(raw.to);
  if (!from || !to) return null;
  const pattern = hex(raw.pattern);
  const symbol = typeof raw.symbol === "string" && SYMBOL_RE.test(raw.symbol) ? raw.symbol : null;
  return { from, to, ...(pattern ? { pattern } : {}), ...(symbol ? { symbol } : {}) };
}
