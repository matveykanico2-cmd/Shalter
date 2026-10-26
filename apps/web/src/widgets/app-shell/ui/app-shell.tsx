import { type ReactNode, useState } from "react";
import { NavLink, useLocation } from "react-router";

import { useMainMenu } from "@/features/accounts";
import { CallDock, IncomingCall } from "@/features/call";
import { LiveHost } from "@/features/live";
import { UserProfileDialog } from "@/features/open-profile";

import type { SelfUser } from "@/entities/session";

import { Avatar, Icon, type IconName, Menu } from "@/shared/ui";

import styles from "./app-shell.module.css";

type Props = {
  user: SelfUser;
  /** Слева: список чатов или боковой раздел (на компьютере). */
  sidebar: ReactNode;
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
export function AppShell({ user, sidebar, main, mainOpen }: Props) {
  const { pathname } = useLocation();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const menu = useMainMenu({ me: user, onOpenProfile: () => setProfileOpen(true) });
  const linkClass = (active: boolean) => (active ? `${styles.railButton} ${styles.railActive}` : styles.railButton);

  return (
    <div className={mainOpen ? `${styles.shell} ${styles.mainOpen}` : styles.shell}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.main}>{main}</main>
      <nav className={styles.rail} aria-label="Навигация">
        <button
          type="button"
          className={styles.account}
          title="Аккаунты"
          aria-label="Аккаунты"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAt({ x: r.left, y: r.top });
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
      {menuAt ? <Menu at={menuAt} items={menu} label="Аккаунты" onClose={() => setMenuAt(null)} /> : null}
      {profileOpen ? <UserProfileDialog userId={user.id} meId={user.id} onClose={() => setProfileOpen(false)} /> : null}
      {/* Звонок живёт вне экранов: звук собеседника, пузырь свёрнутого звонка, входящий. */}
      <CallDock />
      <IncomingCall me={user} />
      {/* Эфир — поверх всего, как overlay в public/js/components/liveScreen.js. */}
      <LiveHost me={user} />
    </div>
  );
}
