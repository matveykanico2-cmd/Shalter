// Фон подарка — перенос public/js/lib/giftBackground.js (как StarGiftBackdrop в tweb):
// заливка цветом края, радиальное свечение в центре и узор символом в цвете pattern.
import { TG_BACKDROPS, TG_SYMBOLS } from "./tg-gift-data";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v: unknown) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);
// Идентификатор символа подставляется в путь к файлу — принимаем только безопасные символы.
const SYMBOL_RE = /^[a-z0-9]{1,32}$/;

export function hash01(str: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export type GiftSymbol = { id: string; name: string; rarity: number; image: string };
export type Backdrop = { id: string; name: string; center: string; edge: string; pattern: string; rarity: number | null; symbol: GiftSymbol | null };
export type BackdropOption = Backdrop | { id: ""; name: string; center: null; edge: null; pattern: null; rarity: null; symbol: null };
export type GiftBackground = { from: string; to: string; pattern?: string; symbol?: string };

export const GIFT_SYMBOLS: GiftSymbol[] = TG_SYMBOLS.map((sym) => ({ ...sym, image: `/gift-symbols/${sym.id}.webp` }));
const SYMBOL_BY_ID = new Map(GIFT_SYMBOLS.map((sym) => [sym.id, sym]));
const slug = (name: string) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Каждому фону — свой узор, чтобы он не менялся от подарка к подарку.
const BACKDROPS: Backdrop[] = TG_BACKDROPS.map((b) => ({
  id: slug(b.name),
  name: b.name,
  center: b.colors[0],
  edge: b.colors[1],
  pattern: b.pattern,
  rarity: b.rarity,
  symbol: GIFT_SYMBOLS[Math.floor(hash01(b.name, 7) * GIFT_SYMBOLS.length)] ?? null,
}))
  // Порядок Telegram: от редких фонов к частым.
  .sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0));

/** «Без фона» — первый, как в списках выбора tweb. */
export const GIFT_BACKDROPS: BackdropOption[] = [{ id: "", name: "Без фона", center: null, edge: null, pattern: null, rarity: null, symbol: null }, ...BACKDROPS];
const BY_ID = new Map(BACKDROPS.map((b) => [b.id, b]));
const BY_COLORS = new Map(BACKDROPS.map((b) => [`${b.center}|${b.edge}`, b]));

export function giftBackdropById(id: string | null | undefined) {
  return BY_ID.get(String(id ?? "").trim().toLowerCase()) ?? null;
}

// Проверка фона на сервере и здесь — одинаковая: два цвета обязательны, узор и символ — нет.
export function sanitizeGiftBackground(bg: unknown): GiftBackground | null {
  if (!bg || typeof bg !== "object") return null;
  const src = bg as Record<string, unknown>;
  const from = hex(src.from);
  const to = hex(src.to);
  if (!from || !to) return null;
  const pattern = hex(src.pattern);
  const symbol = typeof src.symbol === "string" && SYMBOL_RE.test(src.symbol) ? src.symbol : null;
  return { from, to, ...(pattern ? { pattern } : {}), ...(symbol ? { symbol } : {}) };
}

type BackdropSource = { id?: string; center?: string | null; edge?: string | null; from?: string; to?: string; pattern?: string | null; symbol?: string | { id: string } | null };

/** Фон из выбранного в списке или из сохранённого в подарке — в одной форме. */
export function giftBackdrop(src: BackdropSource | null | undefined): Backdrop | null {
  if (!src || typeof src !== "object") return null;
  const center = hex(src.center) ?? hex(src.from);
  const edge = hex(src.edge) ?? hex(src.to);
  if (!center || !edge) return null;
  // Пресет ищем по id, а если его нет (фон серии, собранный из каталога) — по паре цветов.
  const preset = BY_ID.get(String(src.id ?? "")) ?? BY_COLORS.get(`${center}|${edge}`);
  const symbolId = typeof src.symbol === "string" ? src.symbol : (src.symbol?.id ?? preset?.symbol?.id);
  return {
    id: preset?.id ?? "",
    name: preset?.name ?? "",
    center,
    edge,
    pattern: hex(src.pattern) ?? preset?.pattern ?? edge,
    rarity: preset?.rarity ?? null,
    symbol: (symbolId && SYMBOL_BY_ID.get(symbolId)) || null,
  };
}

/** Что уходит на сервер при отправке подарка. */
export function giftBackgroundValue(backdrop: BackdropSource | null | undefined) {
  const bd = giftBackdrop(backdrop);
  if (!bd) return null;
  return sanitizeGiftBackground({ from: bd.center, to: bd.edge, pattern: bd.pattern, symbol: bd.symbol?.id });
}
