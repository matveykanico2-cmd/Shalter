import { useSyncExternalStore } from "react";

import type { BuiltinStickerPack, Sticker } from "@/shared/lib/anim";

import type { StickerPack } from "../api/sticker-packs";

/**
 * Открытый из чата пак: сам пак (или встроенный — builtin), нажатый стикер (крупно, на своём фоне)
 * или «пак не найден».
 */
export type StickerPackView = { pack: StickerPack | null; builtin: BuiltinStickerPack | null; focus: Sticker | null; missing: boolean };

const EMPTY: StickerPackView = { pack: null, builtin: null, focus: null, missing: false };
let state: StickerPackView = EMPTY;
const listeners = new Set<() => void>();
const set = (next: StickerPackView) => {
  state = next;
  listeners.forEach((fn) => fn());
};

export const openStickerPack = (pack: StickerPack, focus: Sticker | null = null) => set({ ...EMPTY, pack, focus });
/** Встроенный пак (есть у всех): его стикеры уходят без packId. */
export const openBuiltinStickerPack = (builtin: BuiltinStickerPack, focus: Sticker | null = null) => set({ ...EMPTY, builtin, focus });
/** Стикер без пака (или пак удалён) — только крупный стикер; missing — «Стикерпак не найден». */
export const openStickerPreview = (focus: Sticker | null, missing = false) => set({ ...EMPTY, focus, missing });
export const closeStickerPack = () => set(EMPTY);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useStickerPackView = () => useSyncExternalStore(subscribe, () => state.pack);
export const useStickerView = () => useSyncExternalStore(subscribe, () => state);
