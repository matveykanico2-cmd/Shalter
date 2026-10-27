import { useEffect } from "react";
import { type NavigateFunction, useNavigate } from "react-router";

type BackWindow = Window & { __shalterBack?: () => boolean };

const overlayOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');

/**
 * Системная «Назад» в Android-приложении (MainActivity.handleBack зовёт window.__shalterBack):
 * то же, что Escape, — закрыть окно, меню, просмотр, панель, ответ в поле ввода; если закрывать
 * нечего — экран назад. false — уже главный экран: приложение уходит в фон.
 */
export function handleHardwareBack(navigate: NavigateFunction) {
  const hadOverlay = overlayOpen();
  let handled = false;
  const ev = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  // Часть обработчиков Escape только останавливает событие, не отменяя его, — это тоже «обработано».
  const stop = ev.stopPropagation.bind(ev);
  const stopNow = ev.stopImmediatePropagation.bind(ev);
  ev.stopPropagation = () => ((handled = true), stop());
  ev.stopImmediatePropagation = () => ((handled = true), stopNow());
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(ev);
  if (hadOverlay || handled || ev.defaultPrevented) return true;

  if (location.pathname === "/" || location.pathname === "") return false;
  // Своя история приложения (react-router хранит номер записи) — назад по ней; открыли сразу
  // этот экран (из уведомления, по ссылке) — на главный.
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) window.history.back();
  else void navigate("/", { replace: true });
  return true;
}

/** Мост для MainActivity: window.__shalterBack, пока приложение открыто; на экране блокировки — в фон. */
export function useBackButton(locked = false) {
  const navigate = useNavigate();
  useEffect(() => {
    const w = window as BackWindow;
    w.__shalterBack = () => (locked ? false : handleHardwareBack(navigate));
    return () => {
      delete w.__shalterBack;
    };
  }, [navigate, locked]);
}
