import type { versionBody } from "@shalter/shared/schemas/misc";
import { useSyncExternalStore } from "react";
import type { z } from "zod";

import { http } from "../api";

// Обновление веб-приложения (PWA и вкладка): на сервере новая сборка — показываем кнопку
// «Обновить», нажатие обновляет service worker и перезагружает страницу. Переустанавливать
// PWA не нужно: страница и код берутся из сети (public/sw.js, network first).

type State = { available: boolean; updating: boolean };

const store = {
  /** Версия открытой сборки без <meta> (dev, сборка без scripts/build.js) — первый ответ /api/version. */
  firstSeen: null as string | null,
  /** Последняя версия на сервере. */
  latest: null as string | null,
  state: { available: false, updating: false } as State,
  listeners: new Set<() => void>(),
  set(next: Partial<State>) {
    const state = { ...this.state, ...next };
    if (state.available === this.state.available && state.updating === this.state.updating) return;
    this.state = state;
    this.listeners.forEach((fn) => fn());
  },
};

const subscribe = (fn: () => void) => {
  store.listeners.add(fn);
  return () => void store.listeners.delete(fn);
};

/** Версия открытой сборки: <meta name="shalter-version"> (scripts/build.js), без неё — первая увиденная. */
export function currentVersion(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="shalter-version"]')?.content || store.firstSeen;
}

/** Последняя версия на сервере (null — ещё не спрашивали или dev). */
export const latestVersion = () => store.latest;

/** Есть ли на сервере сборка новее открытой и идёт ли обновление. */
export function useAppUpdate() {
  return useSyncExternalStore(subscribe, () => store.state);
}

/**
 * Спрашивает сервер о версии; true — на сервере сборка не та, что открыта. Вернулась прежняя
 * (откат) — кнопка пропадает. Без сети — прошлый ответ.
 */
export async function checkForUpdate(): Promise<boolean> {
  try {
    const { version } = await http.get<z.infer<typeof versionBody>>("/api/version");
    if (version && version !== "dev") {
      store.latest = version;
      store.firstSeen ??= version;
      store.set({ available: version !== currentVersion() });
    }
  } catch {
    // Нет сети — проверим в следующий раз.
  }
  return store.state.available;
}

/** Обновить приложение: новый service worker (если вышел) и перезагрузка — с новой сборкой из сети. Повторное нажатие ждёт первое. */
export async function applyUpdate() {
  if (store.state.updating) return;
  store.set({ updating: true });
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    // Не дольше 3 с: на плохой сети перезагрузка всё равно возьмёт страницу из сети.
    if (reg) await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    // Нет service worker — просто перезагружаемся.
  }
  window.location.reload();
}
