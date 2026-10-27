// Окна покупки, которые открывают из любого места (лента, магазин, настройки), — как
// openStarsDialog и openDonationDialog в public/js: само окно рисует хост из features/purchase.
import type { donationOrderBody } from "@shalter/shared/schemas/donations";
import { useSyncExternalStore } from "react";
import type { z } from "zod";

export type DonationOrder = z.infer<typeof donationOrderBody>;

type State = { stars: boolean; donation: DonationOrder | null };

let state: State = { stars: false, donation: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};

/** Окно «Звёзды»: баланс, покупка набора, перевод. */
export const openStarsDialog = () => set({ stars: true });
export const closeStarsDialog = () => set({ stars: false });

/** Окно оплаты через донат-сервис: код заказа и ссылка. */
export const showDonationOrder = (order: DonationOrder) => set({ donation: order });
export const closeDonationOrder = () => set({ donation: null });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const usePurchaseWindows = () => useSyncExternalStore(subscribe, () => state);
