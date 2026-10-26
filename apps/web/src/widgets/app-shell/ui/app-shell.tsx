import type { ReactNode } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router";

import { CallDock, IncomingCall } from "@/features/call";
import { SignOutButton } from "@/features/sign-out";

import type { SelfUser } from "@/entities/session";

import { Icon } from "@/shared/ui";

import styles from "./app-shell.module.css";

type Props = {
  user: SelfUser;
  /** Список чатов — слева, остаётся на месте при переходах между экранами. */
  sidebar?: ReactNode;
};

export function AppShell({ user, sidebar }: Props) {
  // На телефоне видно что-то одно: список чатов или открытый чат.
  // Ссылка /u/имя или /@имя тоже открывает экран справа: профиль, превью канала; так же звонок и «Звонки».
  const { pathname } = useLocation();
  const chatOpen = !!useMatch("/chat/:chatId") || /^\/(u\/|@|join\/|call\/|call-join\/)[^/]+\/?$/.test(pathname) || pathname === "/calls";
  return (
    <div className={chatOpen ? `${styles.shell} ${styles.chatOpen}` : styles.shell}>
      <nav className={styles.rail} aria-label="Навигация">
        <span className={styles.avatar} title={user.name}>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <Link to="/calls" className={pathname === "/calls" ? `${styles.railButton} ${styles.railActive}` : styles.railButton} title="Звонки" aria-label="Звонки">
          <Icon name="Phone" size={20} />
        </Link>
        <SignOutButton uid={user.id} />
      </nav>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.main}>
        <Outlet />
      </main>
      {/* Звонок живёт вне экранов: звук собеседника, пузырь свёрнутого звонка, входящий. */}
      <CallDock />
      <IncomingCall me={user} />
    </div>
  );
}
