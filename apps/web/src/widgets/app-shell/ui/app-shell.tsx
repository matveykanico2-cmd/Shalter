import { type ReactNode, useState } from "react";
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
          <Avatar name={user.name || user.phone || "?"} color={user.avatarColor} image={user.avatarImage} size={34} online />
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
