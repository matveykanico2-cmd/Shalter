// Сетка, расстояние и корзины «Людей рядом» — как server/data/nearby.js.

const GRID = 0.01;
/** Место старше получаса не показывается. */
export const PRESENCE_TTL_MS = 30 * 60 * 1000;
// «Люди рядом» — не список всех, кто поделился местом: дальше этого радиуса не показываем.
// Клиент радиус не передаёт, корзина «более 30 км» — это 30–50 км.
export const MAX_RADIUS_KM = 50;

/** Место хранится с точностью ~1 км: точные координаты никому не раскрываются. */
export function roundCoord(v: number): number {
  return Math.round(v / GRID) * GRID;
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const BUCKETS = [
  { max: 1, label: "менее 1 км" },
  { max: 3, label: "1–3 км" },
  { max: 10, label: "3–10 км" },
  { max: 30, label: "10–30 км" },
  { max: Infinity, label: "более 30 км" },
];

export function bucketFor(km: number): { label: string; order: number } {
  const b = BUCKETS.find((b) => km < b.max)!;
  return { label: b.label, order: BUCKETS.indexOf(b) };
}

// Число или непустая числовая строка: Number("") и Number(null) дали бы 0 —
// «место 0, 0» вместо ошибки.
export function coord(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

export function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
