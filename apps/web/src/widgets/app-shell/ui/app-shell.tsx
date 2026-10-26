import type { ReactNode } from "react";
import { Outlet, useLocation, useMatch } from "react-router";

import { SignOutButton } from "@/features/sign-out";

import type { SelfUser } from "@/entities/session";

import styles from "./app-shell.module.css";

type Props = {
  user: SelfUser;
  /** Список чатов — слева, остаётся на месте при переходах между экранами. */
  sidebar?: ReactNode;
};

export function AppShell({ user, sidebar }: Props) {
  // На телефоне видно что-то одно: список чатов или открытый чат.
  // Ссылка /u/имя или /@имя тоже открывает экран справа: профиль, превью канала.
  const { pathname } = useLocation();
  const chatOpen = !!useMatch("/chat/:chatId") || /^\/(u\/|@)[^/]+\/?$/.test(pathname);
  return (
    <div className={chatOpen ? `${styles.shell} ${styles.chatOpen}` : styles.shell}>
      <nav className={styles.rail} aria-label="Навигация">
        <span className={styles.avatar} title={user.name}>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <SignOutButton uid={user.id} />
      </nav>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
