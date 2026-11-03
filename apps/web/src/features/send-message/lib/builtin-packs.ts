import { type BuiltinStickerPack, DRAWN_STICKERS, MASCOT_PACKS, type Sticker } from "@/shared/lib/anim";

/** Встроенные наборы: рисованные стикеры Shalter и персонажи (котик, лисёнок, утёнок, зайка). */
export const BUILTIN_STICKER_PACKS: readonly BuiltinStickerPack[] = [{ id: "builtin_classic", name: "Shalter", stickers: DRAWN_STICKERS }, ...MASCOT_PACKS];

/**
 * Встроенный пак стикера из сообщения. Такие стикеры уходят без packId — эмодзи и сценой
 * (id рисунка), поэтому ищем пак по сцене, а у старых сообщений — по id.
 */
export function findBuiltinPack(sticker: Pick<Sticker, "id" | "scene">): BuiltinStickerPack | null {
  const scene = typeof sticker.scene === "string" ? sticker.scene : null;
  if (!scene && !sticker.id) return null;
  return (
    BUILTIN_STICKER_PACKS.find((p) => p.stickers.some((s) => (scene && s.scene === scene) || (sticker.id && s.id === sticker.id))) ?? null
  );
}
