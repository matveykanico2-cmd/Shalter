import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";

import { MainMenuHost, openMainMenu } from "@/features/accounts";
import { CallDock, IncomingCall } from "@/features/call";
import { LiveHost } from "@/features/live";
import { openPwaInstallDialog, PwaInstallDialog } from "@/features/pwa-install";
import { UploadTasksHost } from "@/features/send-message";
import { StoryViewerHost } from "@/features/stories";

import type { SelfUser } from "@/entities/session";

import { useAppUpdate } from "@/shared/lib/app-update";
import { Avatar, Icon, type IconName, NowPlayingBar } from "@/shared/ui";

import styles from "./app-shell.module.css";

// Эти overlay-экраны не должны попадать в первый чанк: они открываются только
// по действию пользователя. Сама оболочка чатов и входящий звонок остаются
// синхронными, поэтому уведомления не ждут загрузки ленивых разделов.
const DownloadsDialog = lazy(() => import("@/features/downloads").then((m) => ({ default: m.DownloadsDialog })));
const GamesHost = lazy(() => import("@/features/games").then((m) => ({ default: m.GamesHost })));
const GiftShopHost = lazy(() => import("@/features/gifts").then((m) => ({ default: m.GiftShopHost })));
const PurchaseHost = lazy(() => import("@/features/purchase").then((m) => ({ default: m.PurchaseHost })));

type Props = {
  user: SelfUser;
  /** Слева: список чатов или боковой раздел (на компьютере). */
  sidebar: ReactNode;
  /** Боковой раздел на компьютере (настройки, контакты…) — поверх списка чатов. */
  side?: ReactNode;
  /** Справа: чат и остальные экраны. */
  main: ReactNode;
  /** На телефоне виден экран справа, а не список. */
  mainOpen: boolean;
};

/** Поле, у которого открывается экранная клавиатура. */
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(el.type);
  return el.isContentEditable;
}

/**
 * Клавиатура на телефоне: пока в фокусе поле ввода, оболочка закреплена ровно на видимой части
 * окна (visualViewport): высота — в --vvh, сдвиг сверху — в --vvt. iOS Safari не ужимает страницу
 * под клавиатуру, а сдвигает видимую область и двигает её за курсором при наборе; раньше мы
 * в ответ прокручивали страницу обратно (scrollTo), iOS — снова к курсору, и экран дёргался на
 * каждом символе, а поле ввода уезжало под клавиатуру. Теперь страницу не трогаем, а оболочка
 * едет вместе с видимой областью. На Android окно ужимается само, там --vvt = 0.
 * Класс снимаем не сразу: переход фокуса между полями и кнопками панели не перестраивает оболочку.
 */
function useKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    // На Android Capacitor WebView окно уже получает adjustResize. Повторное
    // position:fixed + visualViewport resize здесь даёт двойное изменение высоты:
    // при каждом символе поле наезжает вверх, затем возвращается вниз. Android
    // оставляем нативному resize, а visualViewport используем для iOS/PWA.
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const androidNative = /Android/i.test(navigator.userAgent) && !!capacitor?.isNativePlatform?.();
    if (androidNative) return;
    let frame = 0;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    let lastHeight = "";
    let lastTop = "";
    const apply = () => {
      frame = 0;
      if (!vv) return;
      const height = `${Math.round(vv.height)}px`;
      // Не двигаем оболочку вслед за caret/автопрокруткой iOS: offsetTop меняется
      // во время набора и из-за этого поле прыгало между верхом и низом экрана.
      const top = "0px";
      if (height !== lastHeight) {
        lastHeight = height;
        root.style.setProperty("--vvh", height);
      }
      if (top !== lastTop) {
        lastTop = top;
        root.style.setProperty("--vvt", top);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const open = () => {
      if (root.classList.contains("keyboard-open")) return;
      apply();
      root.classList.add("keyboard-open");
      vv?.addEventListener("resize", schedule);
    };
    const close = () => {
      if (!root.classList.contains("keyboard-open")) return;
      root.classList.remove("keyboard-open");
      vv?.removeEventListener("resize", schedule);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
      lastHeight = "";
      lastTop = "";
      // iOS после закрытия клавиатуры иногда оставляет страницу прокрученной.
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    };
    const onFocus = (e: FocusEvent) => {
      clearTimeout(blurTimer);
      if (isEditable(e.target)) open();
    };
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!isEditable(document.activeElement)) close();
      }, 150);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      clearTimeout(blurTimer);
      cancelAnimationFrame(frame);
      close();
    };
  }, []);
}

const LINKS: { to: string; icon: IconName; label: string; active: (path: string) => boolean }[] = [
  { to: "/feed", icon: "Globe", label: "Лента", active: (p) => p === "/feed" },
  { to: "/", icon: "Send", label: "Чаты", active: (p) => p === "/" || p.startsWith("/chat") },
  { to: "/contacts", icon: "Users", label: "Контакты", active: (p) => p === "/contacts" },
  { to: "/calls", icon: "Phone", label: "Звонки", active: (p) => p === "/calls" },
  { to: "/archive", icon: "Archive", label: "Архив", active: (p) => p === "/archive" },
];

/**
 * Оболочка как в public/js/app.js: «список | экран», снизу — панель навигации (аккаунт, Чаты,
 * Контакты, Звонки, Архив, Настройки). Остаётся смонтированной при переходах.
 */
export function AppShell({ user, sidebar, side, main, mainOpen }: Props) {
  const { pathname } = useLocation();
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [optionalHostsReady, setOptionalHostsReady] = useState(false);
  const appUpdate = useAppUpdate();
  const linkClass = (active: boolean) => (active ? `${styles.railButton} ${styles.railActive}` : styles.railButton);

  useKeyboardViewport();

  // Оверлеи нужны постоянно только после первого кадра: до этого они не должны
  // конкурировать с чатом за CPU, память и сетевой канал.
  useEffect(() => {
    const reveal = () => setOptionalHostsReady(true);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }).requestIdleCallback;
    if (idle) {
      const id = idle(reveal, { timeout: 1800 });
      return () => window.cancelIdleCallback(id);
    }
    const fallback = window.setTimeout(reveal, 1200);
    return () => window.clearTimeout(fallback);
  }, []);

  // При переходе между чатами textarea размонтируется, но iOS иногда оставляет
  // системную клавиатуру открытой ещё на один экран. Снимаем фокус явно.
  useEffect(() => {
    const active = document.activeElement;
    if (isEditable(active)) (active as HTMLElement).blur();
  }, [pathname]);

  return (
    <div className={mainOpen ? `${styles.shell} ${styles.mainOpen}` : styles.shell}>
      {/* «Сейчас играет» — над всем приложением, как в ВК и Telegram: звук не прерывается при переходах. */}
      <div className={styles.media}>
        <NowPlayingBar />
      </div>
      <aside className={styles.sidebar}>
        {sidebar}
        {side ? <div className={styles.side}>{side}</div> : null}
      </aside>
      <main className={styles.main}>{main}</main>
      <nav className={styles.rail} aria-label="Навигация">
        <button
          type="button"
          className={styles.account}
          title="Аккаунты"
          aria-label="Аккаунты"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMainMenu({ x: r.left, y: r.top });
          }}
        >
          <Avatar name={user.name || user.phone || "?"} color={user.avatarColor} image={user.avatarImage} emoji={user.avatarEmoji} size={34} online />
        </button>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={linkClass(l.active(pathname))} title={l.label} aria-label={l.label}>
            <Icon name={l.icon} size={20} />
            <span className={styles.railLabel}>
              {l.label}
              {l.label === "Чаты" && user.isPremium ? <Icon name="Star" size={12} className={styles.premiumChatStar} aria-hidden="true" /> : null}
            </span>
          </NavLink>
        ))}
        <span className={styles.spacer} />
        <NavLink to="/settings" className={linkClass(pathname.startsWith("/settings"))} title="Настройки" aria-label="Настройки">
          <Icon name="Settings" size={20} />
          <span className={styles.railLabel}>Настройки</span>
        </NavLink>
      </nav>
      {/* Главное меню: аватар здесь и «Меню» в шапке списка; extra — разделы со своим окном. */}
      <MainMenuHost me={user} extra={[
          { icon: "Smile", label: "Игры", onClick: () => void import("@/entities/game").then(({ openGamesCatalog }) => openGamesCatalog()) },
          { icon: "Download", label: "Загрузки", onClick: () => setDownloadsOpen(true) },
          { icon: "Download", label: "Установить Shalter", onClick: openPwaInstallDialog },
        ]} />
      <Suspense fallback={null}>
        {downloadsOpen ? <DownloadsDialog onClose={() => setDownloadsOpen(false)} /> : null}
      </Suspense>
      <PwaInstallDialog />
      <UploadTasksHost visible={!mainOpen} />
      {/* Звонок живёт вне экранов: звук собеседника, пузырь свёрнутого звонка, входящий. */}
      <CallDock />
      <IncomingCall me={user} />
      {appUpdate.updating ? (
        <div className={styles.updateOverlay} role="status" aria-live="polite" aria-busy="true">
          <div className={styles.updateCard}>
            <span className={styles.updateSpinner} aria-hidden="true" />
            <strong>Обновляется</strong>
            <span>Пожалуйста, подождите. Приложение скоро перезапустится.</span>
          </div>
        </div>
      ) : null}
      {/* Эфир и истории слушают события сразу; тяжёлые окна подключаются после первого кадра. */}
      <LiveHost me={user} />
      <StoryViewerHost me={user} />
      {optionalHostsReady ? (
        <Suspense fallback={null}>
          <PurchaseHost />
          <GiftShopHost />
          <GamesHost />
        </Suspense>
      ) : null}
    </div>
  );
}
