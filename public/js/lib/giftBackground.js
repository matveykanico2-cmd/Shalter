// Фон подарка — как в tweb (components/stargifts/stargiftBackdrop.tsx, StarGiftBackdrop):
// заливка цветом края, радиальное свечение в центре (center_color → edge_color) и
// узор символом в цвете pattern_color. Список фонов и символов — настоящие из
// Telegram (scripts/import-telegram-gifts.js → tgGiftData.js), редкость — их доля
// среди выпущенных коллекционных подарков.
import { el } from "./dom.js";
import { TG_BACKDROPS, TG_SYMBOLS } from "./tgGiftData.js";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);
// Идентификатор символа подставляется в путь к файлу — принимаем только безопасные символы.
const SYMBOL_RE = /^[a-z0-9]{1,32}$/;

export function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const SYMBOLS = TG_SYMBOLS.map((sym) => ({ ...sym, image: `/gift-symbols/${sym.id}.webp` }));
const SYMBOL_BY_ID = new Map(SYMBOLS.map((sym) => [sym.id, sym]));
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Каждому фону — свой узор, чтобы он не менялся от подарка к подарку.
const BACKDROPS = TG_BACKDROPS.map((b) => ({
  id: slug(b.name),
  name: b.name,
  center: b.colors[0],
  edge: b.colors[1],
  pattern: b.pattern,
  rarity: b.rarity,
  symbol: SYMBOLS[Math.floor(hash01(b.name, 7) * SYMBOLS.length)],
}))
  // Порядок Telegram: от редких фонов к частым.
  .sort((a, b) => b.rarity - a.rarity);

// «Без фона» — первый, как в списках выбора tweb.
export const GIFT_BACKDROUNDS = [{ id: "", name: "Без фона", center: null, edge: null, pattern: null, rarity: null, symbol: null }, ...BACKDROPS];
const BY_ID = new Map(BACKDROPS.map((b) => [b.id, b]));
const BY_COLORS = new Map(BACKDROPS.map((b) => [`${b.center}|${b.edge}`, b]));

export function giftBackdropById(id) {
  return BY_ID.get(String(id ?? "").trim().toLowerCase()) ?? null;
}

// Проверка фона на сервере и здесь — одинаковая: два цвета обязательны, узор и
// символ необязательны (подарки, отправленные до появления выбора фона).
export function sanitizeGiftBackground(bg) {
  if (!bg || typeof bg !== "object") return null;
  const from = hex(bg.from);
  const to = hex(bg.to);
  if (!from || !to) return null;
  const pattern = hex(bg.pattern);
  const symbol = typeof bg.symbol === "string" && SYMBOL_RE.test(bg.symbol) ? bg.symbol : null;
  return { from, to, ...(pattern ? { pattern } : {}), ...(symbol ? { symbol } : {}) };
}

// Фон из выбранного в списке или из сохранённого в подарке — в одной форме:
// { id, name, center, edge, pattern, rarity, symbol }.
export function giftBackdrop(src) {
  if (!src || typeof src !== "object") return null;
  const center = hex(src.center) ?? hex(src.from);
  const edge = hex(src.edge) ?? hex(src.to);
  if (!center || !edge) return null;
  // Пресет ищем по id, а если его нет (фон серии, собранный из каталога) — по паре цветов.
  const preset = BY_ID.get(String(src.id ?? "")) ?? BY_COLORS.get(`${center}|${edge}`);
  const symbolId = typeof src.symbol === "string" ? src.symbol : src.symbol?.id ?? preset?.symbol?.id;
  return {
    id: preset?.id ?? "",
    name: preset?.name ?? "",
    center,
    edge,
    pattern: hex(src.pattern) ?? preset?.pattern ?? edge,
    rarity: preset?.rarity ?? null,
    symbol: SYMBOL_BY_ID.get(symbolId) ?? null,
  };
}

// Что уходит на сервер при отправке подарка.
export function giftBackgroundValue(backdrop) {
  const bd = giftBackdrop(backdrop);
  if (!bd) return null;
  return sanitizeGiftBackground({ from: bd.center, to: bd.edge, pattern: bd.pattern, symbol: bd.symbol?.id });
}

function backdropVars(bd) {
  return `--gift-backdrop-edge:${bd.edge};--gift-backdrop-center:${bd.center};--gift-backdrop-pattern:${bd.pattern}`;
}

// Три слоя фона tweb: край, свечение, узор.
export function renderGiftBackdrop(src, { small = false, className = "" } = {}) {
  const bd = giftBackdrop(src);
  if (!bd) return null;
  return el("div", { class: `tw-gift-backdrop${small ? " tw-gift-backdrop-small" : ""}${className ? ` ${className}` : ""}`, style: backdropVars(bd) }, [
    el("div", { class: "tw-gift-backdrop-halo" }),
    bd.symbol ? el("div", { class: "tw-gift-backdrop-pattern", style: `--gift-symbol: url("${bd.symbol.image}")` }) : null,
  ]);
}