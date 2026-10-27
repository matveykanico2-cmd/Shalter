import { randomInt } from "node:crypto";
import { PROMO_PRIZES, type PromoCode, type PromoCodeRow, type PromoConfig } from "../model/domain.js";

// Как server/data/promoCodes.js.

// Без 0/O и 1/I — код диктуют и переписывают руками.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generatePromoCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function parsePromoConfig(raw: string | null): PromoConfig | null {
  try {
    const c = JSON.parse(raw ?? "") as PromoConfig | null;
    return c && (PROMO_PRIZES as readonly string[]).includes(c.type) ? c : null;
  } catch {
    return null;
  }
}

export function toPromoCode(row: PromoCodeRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    prize: row.prize,
    config: parsePromoConfig(row.config),
    usesTotal: row.usesTotal ?? null,
    used: row.used ?? 0,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}
