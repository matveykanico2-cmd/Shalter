// Сохранение кэша запросов на устройство: каждый успешный ответ подходящего запроса —
// в хранилище, не чаще раза в delayMs на ключ. При отписке несохранённое дописывается,
// но только если кэш устройства с начала подписки не стирали (выход, удаление аккаунта):
// иначе запоздалая запись вернула бы переписку вышедшего на устройство.
import type { Query, QueryClient } from "@tanstack/react-query";

import { cacheGeneration } from "./local-cache";

/**
 * pick — ключ сохранения для запроса (null — запрос не сохраняем), save — записать его.
 * Возвращает отписку.
 */
export function persistQueries(client: QueryClient, pick: (query: Query) => string | null, save: (key: string) => void, delayMs: number) {
  const generation = cacheGeneration();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const run = (key: string) => {
    timers.delete(key);
    if (cacheGeneration() === generation) save(key);
  };
  const off = client.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success") return;
    const key = pick(e.query);
    if (key !== null && !timers.has(key)) timers.set(key, setTimeout(() => run(key), delayMs));
  });
  return () => {
    off();
    for (const [key, timer] of timers) {
      clearTimeout(timer);
      run(key);
    }
  };
}
