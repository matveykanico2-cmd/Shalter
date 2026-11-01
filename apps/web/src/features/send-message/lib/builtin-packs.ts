import { DRAWN_STICKERS, type Sticker, STICKERS } from "@/shared/lib/anim";

/** Встроенный набор: есть у всех, добавлять и удалять нечего. */
export type BuiltinPack = { id: "shalter" | "standard"; name: string; description: string; stickers: Sticker[] };

const SHALTER: BuiltinPack = { id: "shalter", name: "Shalter", description: "Нарисованные стикеры Shalter — есть у всех.", stickers: DRAWN_STICKERS };
const STANDARD: BuiltinPack = { id: "standard", name: "Стандартные", description: "Анимированные эмодзи — есть у всех.", stickers: STICKERS };

/** Встроенный набор стикера из сообщения (сервер хранит только эмодзи, имя сцены и анимацию). */
export function builtinPackOf(s: Sticker): BuiltinPack | null {
  if (s.kind || s.packId) return null;
  if (typeof s.scene === "string" && DRAWN_STICKERS.some((d) => d.scene === s.scene)) return SHALTER;
  if (STICKERS.some((d) => d.emoji === s.emoji && (!s.anim || d.anim === s.anim))) return STANDARD;
  return null;
}
