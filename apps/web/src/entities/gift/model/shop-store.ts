import { useSyncExternalStore } from "react";

import type { GiftLike, GiftRecipient } from "./types";

/**
 * Окно «Отправить подарок» открывают отовсюду — профиль, «Информация о чате», подарок в ленте,
 * поздравление с днём рождения (openGiftShopDialog в public/js/components/giftShopDialog.js).
 * Само окно рисует хост из features/gifts.
 */
export type GiftShopRequest = {
  id: number;
  /** null — выбрать получателя в окне. */
  recipient: GiftRecipient | null;
  /** Подарок выбран заранее («Отправить такой же», «Быстро:») — окно сразу на странице отправки. */
  gift: GiftLike | null;
  backdropId: string | null;
};

let current: GiftShopRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openGiftShop({ recipient = null, gift = null, backdropId = null }: { recipient?: GiftRecipient | null; gift?: GiftLike | null; backdropId?: string | null } = {}) {
  current = { id: ++seq, recipient, gift, backdropId };
  emit();
}

export function closeGiftShop() {
  if (!current) return;
  current = null;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useGiftShopRequest = () => useSyncExternalStore(subscribe, () => current);
