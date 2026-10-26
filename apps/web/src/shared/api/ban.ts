// Блокировка аккаунта: заблокированный входит, но любой защищённый запрос отвечает
// 403 { error: "banned", banReason, bannedUntil } — тогда приложение закрывает экран
// блокировки (как api.js → showBanScreen в public/js). Повторный ответ только обновляет его.
import { useSyncExternalStore } from "react";

export type BanInfo = { banReason: string | null; bannedUntil: string | null };

let current: BanInfo | null = null;
const listeners = new Set<() => void>();

export function reportBanned(body: { banReason?: unknown; bannedUntil?: unknown }) {
  const next: BanInfo = {
    banReason: typeof body.banReason === "string" ? body.banReason : null,
    bannedUntil: typeof body.bannedUntil === "string" ? body.bannedUntil : null,
  };
  if (current && current.banReason === next.banReason && current.bannedUntil === next.bannedUntil) return;
  current = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Аккаунт заблокирован — сведения для экрана блокировки; null — нет. */
export const useBan = () => useSyncExternalStore(subscribe, () => current);
