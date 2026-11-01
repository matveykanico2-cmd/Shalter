import { useSyncExternalStore } from "react";

import { parseProxyLink, type ProxyLink } from "../lib/proxy-link";

// Сохранённые прокси — на этом устройстве (localStorage), как в Telegram.
const KEY = "shalter.proxies";
const listeners = new Set<() => void>();
let cache: ProxyLink[] | null = null;

function read(): ProxyLink[] {
  if (cache) return cache;
  let links: unknown;
  try {
    links = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    links = [];
  }
  cache = (Array.isArray(links) ? links : [])
    .map((l) => (typeof l === "string" ? parseProxyLink(l) : null))
    .filter((p): p is ProxyLink => !!p);
  return cache;
}

function write(list: ProxyLink[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map((p) => p.link)));
  } catch {
    /* без сохранения — список только до перезагрузки */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Другая вкладка поменяла список.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const savedProxies = {
  list: read,
  /** Добавить (тот же прокси — заменяет секрет и поднимает наверх). */
  add(proxy: ProxyLink) {
    write([proxy, ...read().filter((p) => p.origin !== proxy.origin)]);
  },
  remove(origin: string) {
    write(read().filter((p) => p.origin !== origin));
  },
  /** Только для тестов: забыть прочитанное. */
  reset() {
    cache = null;
  },
};

export function useSavedProxies(): ProxyLink[] {
  return useSyncExternalStore(subscribe, read, read);
}
