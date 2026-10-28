import { useSyncExternalStore } from "react";

import type { StickerPack } from "../api/sticker-packs";

let state: { pack: StickerPack | null } = { pack: null };
const listeners = new Set<() => void>();
const set = (next: Partial<typeof state>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};

export const openStickerPack = (pack: StickerPack) => set({ pack });
export const closeStickerPack = () => set({ pack: null });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useStickerPackView = () => useSyncExternalStore(subscribe, () => state.pack);
