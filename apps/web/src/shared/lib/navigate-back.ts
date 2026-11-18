import type { NavigateFunction } from "react-router";

/**
 * Возвращает пользователя на предыдущий экран, а при прямом открытии ссылки
 * — в указанное безопасное место. navigate(-1) сам по себе ничего не делает,
 * если в истории нет маршрута приложения.
 */
export function navigateBack(navigate: NavigateFunction, fallback = "/") {
  const { hasRouterHistory, hasSameOriginReferrer } = backHistoryState();

  if (hasRouterHistory || hasSameOriginReferrer) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}

/** Вариант для глобального error boundary, который находится над RouterProvider. */
export function browserNavigateBack(fallback = "/") {
  const { hasRouterHistory, hasSameOriginReferrer } = backHistoryState();
  if (hasRouterHistory || hasSameOriginReferrer) window.history.back();
  else window.location.replace(fallback);
}

function backHistoryState() {
  const historyState = window.history.state as { idx?: unknown } | null;
  const hasRouterHistory = typeof historyState?.idx === "number" && historyState.idx > 0;
  let hasSameOriginReferrer: boolean;
  try {
    hasSameOriginReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
  } catch {
    hasSameOriginReferrer = false;
  }
  return { hasRouterHistory, hasSameOriginReferrer };
}
