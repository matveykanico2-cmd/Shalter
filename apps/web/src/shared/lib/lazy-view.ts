import { type ComponentType, lazy, type LazyExoticComponent } from "react";

const RELOAD_KEY = "shalter:lazy-reload";

const isChunkLoadError = (error: unknown) => {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|loading chunk|chunkloaderror|importing a module script/i.test(text);
};

/**
 * После выкладки старый index.html во вкладке может ссылаться на уже удалённый хешированный
 * chunk. Один раз обновляем документ и получаем согласованный index + assets. Повторная ошибка
 * уходит в обычный ErrorBoundary, поэтому цикл перезагрузок невозможен.
 */
export function lazyView<P extends object>(load: () => Promise<ComponentType<P>>): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      const component = await load();
      sessionStorage.removeItem(RELOAD_KEY);
      return { default: component };
    } catch (error) {
      if (isChunkLoadError(error) && sessionStorage.getItem(RELOAD_KEY) !== location.pathname) {
        sessionStorage.setItem(RELOAD_KEY, location.pathname);
        location.reload();
        await new Promise<never>(() => {});
      }
      throw error;
    }
  });
}
