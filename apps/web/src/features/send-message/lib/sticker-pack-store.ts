import { useSyncExternalStore } from "react";

import type { Sticker } from "@/shared/lib/anim";

import type { StickerPack } from "../api/sticker-packs";

/** Открытый из чата пак: сам пак, нажатый стикер (крупно, на своём фоне) или «пак не найден». */
export type StickerPackView = { pack: StickerPack | null; focus: Sticker | null; missing: boolean };

let state: StickerPackView = { pack: null, focus: null, missing: false };
const listeners = new Set<() => void>();
const set = (next: StickerPackView) => {
  state = next;
  listeners.forEach((fn) => fn());
};

export const openStickerPack = (pack: StickerPack, focus: Sticker | null = null) => set({ pack, focus, missing: false });
/** Стикер без пака (или пак удалён) — только крупный стикер; missing — «Стикерпак не найден». */
export const openStickerPreview = (focus: Sticker | null, missing = false) => set({ pack: null, focus, missing });
export const closeStickerPack = () => set({ pack: null, focus: null, missing: false });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useStickerPackView = () => useSyncExternalStore(subscribe, () => state.pack);
export const useStickerView = () => useSyncExternalStore(subscribe, () => state);
