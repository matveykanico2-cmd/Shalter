import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";

import { MainMenuHost, openMainMenu } from "@/features/accounts";
import { CallDock, IncomingCall } from "@/features/call";
import { DownloadsDialog } from "@/features/downloads";
import { GamesHost } from "@/features/games";
import { GiftShopHost } from "@/features/gifts";
import { LiveHost } from "@/features/live";
import { PurchaseHost } from "@/features/purchase";
import { StoryViewerHost } from "@/features/stories";

import { openGamesCatalog } from "@/entities/game";
import type { SelfUser } from "@/entities/session";

import { Avatar, Icon, type IconName, NowPlayingBar } from "@/shared/ui";

import styles from "./app-shell.module.css";

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
 * Клавиатура на телефоне: пока в фокусе поле ввода, высота оболочки — видимая часть окна
 * (visualViewport): 100dvh на Android с клавиатурой оставлял пустую зону, а iOS Safari прокручивал
 * страницу под клавиатуру. Высоту пишем в --vvh раз в кадр и только когда она изменилась, класс
 * снимаем не сразу: переход фокуса между полями и кнопками панели не перестраивает оболочку
 * (на iPhone это мигало при наборе).
 */
function useKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let frame = 0;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    let last = "";
    const apply = () => {
      frame = 0;
      if (!vv) return;
      const next = `${Math.round(vv.height)}px`;
      if (next !== last) {
        last = next;
        root.style.setProperty("--vvh", next);
      }
      // iOS Safari сдвигает layout viewport под клавиатуру — возвращаем страницу на место.
      if (vv.offsetTop > 0 && window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const open = () => {
      if (root.classList.contains("keyboard-open")) return;
      root.classList.add("keyboard-open");
      vv?.addEventListener("resize", schedule);
      vv?.addEventListener("scroll", schedule);
      apply();
    };
    const close = () => {
      if (!root.classList.contains("keyboard-open")) return;
      root.classList.remove("keyboard-open");
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      root.style.removeProperty("--vvh");
      last = "";
    };
    const onFocus = (e: FocusEvent) => {
      clearTimeout(blurTimer);
      if (isEditable(e.target)) open();
    };
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!isEditable(document.activeElement)) close();
      }, 100);
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
  const linkClass = (active: boolean) => (active ? `${styles.railButton} ${styles.railActive}` : styles.railButton);

  useKeyboardViewport();

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
          </NavLink>
        ))}
        <span className={styles.spacer} />
        <NavLink to="/settings" className={linkClass(pathname.startsWith("/settings"))} title="Настройки" aria-label="Настройки">
          <Icon name="Settings" size={20} />
        </NavLink>
      </nav>
      {/* Главное меню: аватар здесь и «Меню» в шапке списка; extra — разделы со своим окном. */}
      <MainMenuHost me={user} extra={[
          { icon: "Smile", label: "Игры", onClick: () => openGamesCatalog() },
          { icon: "Download", label: "Загрузки", onClick: () => setDownloadsOpen(true) },
        ]} />
      {downloadsOpen ? <DownloadsDialog onClose={() => setDownloadsOpen(false)} /> : null}
      {/* Звонок живёт вне экранов: звук собеседника, пузырь свёрнутого звонка, входящий. */}
      <CallDock />
      <IncomingCall me={user} />
      {/* Эфир — поверх всего, как overlay в public/js/components/liveScreen.js. */}
      <LiveHost me={user} />
      {/* Просмотр историй — из полосы над чатами и из профиля. */}
      <StoryViewerHost me={user} />
      {/* Окна покупки звёзд и оплаты донатом — их открывают из ленты, магазина и настроек. */}
      <PurchaseHost />
      {/* Магазин подарков и окна игр — их открывают из профиля, ленты, меню и настроек. */}
      <GiftShopHost />
      <GamesHost />
    </div>
  );
}
