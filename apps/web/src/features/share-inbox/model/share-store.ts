import { useSyncExternalStore } from "react";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { getSharePayload, type SharePayload } from "../api/share";

// Открытое окно «Поделиться в Shalter» — одно на приложение: маршрут /share/:token
// сразу уходит к чатам, а окно остаётся поверх.
let current: { id: number; share: SharePayload } | null = null;
let seq = 0;
// Токен одноразовый: повторный вызов (двойной эффект в разработке) не должен его «сжечь» второй раз.
const opened = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function closeShare() {
  current = null;
  emit();
}

/** Точка входа /share/:token — содержимое забираем одноразово (openShareFromToken). */
export async function openShareFromToken(token: string) {
  if (opened.has(token)) return;
  opened.add(token);
  try {
    const { share } = await getSharePayload(token);
    if (!share.text && !share.url && !share.file) return toast("Нечего отправить");
    current = { id: ++seq, share };
    emit();
  } catch (err) {
    toast(errorText(err, "Ссылка устарела — поделитесь ещё раз"), { error: true });
  }
}

const PENDING_KEY = "shalter.share";

/** Отправка из «Поделиться», пережившая вход в аккаунт (sessionStorage, как в public/js/app.js). */
export function rememberPendingShare(token: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, token);
  } catch {
    // Хранилище недоступно — после входа окна не будет.
  }
}

export function takePendingShare() {
  try {
    const token = sessionStorage.getItem(PENDING_KEY);
    if (token) sessionStorage.removeItem(PENDING_KEY);
    return token;
  } catch {
    return null;
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useShare = () => useSyncExternalStore(subscribe, () => current);
