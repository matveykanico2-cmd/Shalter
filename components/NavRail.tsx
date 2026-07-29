"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Avatar } from "./Avatar";
import { DropdownMenu } from "./DropdownMenu";
import { useCurrentUser, useAccounts } from "@/lib/client/CurrentUserContext";
import { api } from "@/lib/client/api";

function RailButton({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-alt hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const accounts = useAccounts();
  const [switcher, setSwitcher] = useState<{ x: number; y: number } | null>(null);

  async function switchTo(uid: string) {
    if (uid === user.id) {
      setSwitcher(null);
      return;
    }
    await api.switchAccount(uid);
    setSwitcher(null);
    router.push("/");
    router.refresh();
  }

  async function logoutOne(uid: string) {
    const { remaining } = await api.logout(uid);
    setSwitcher(null);
    if (remaining.length === 0) {
      window.location.href = "/login";
    } else {
      router.refresh();
    }
  }

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-4">
      <button
        onClick={(e) => setSwitcher({ x: e.clientX, y: e.clientY })}
        className="mb-2"
        title="Аккаунты"
      >
        <Avatar name={user.name || user.phone} color={user.avatarColor} image={user.avatarImage} size={40} online />
      </button>
      <RailButton href="/" active={pathname === "/" || pathname.startsWith("/chat")} label="Чаты">
        <Icon.Send size={20} />
      </RailButton>
      <RailButton href="/contacts" active={pathname === "/contacts"} label="Контакты">
        <Icon.Users size={20} />
      </RailButton>
      <RailButton href="/calls" active={pathname === "/calls"} label="Звонки">
        <Icon.Phone size={20} />
      </RailButton>
      <RailButton href="/archive" active={pathname === "/archive"} label="Архив">
        <Icon.Archive size={20} />
      </RailButton>
      <div className="flex-1" />
      <RailButton href="/settings" active={pathname.startsWith("/settings")} label="Настройки">
        <Icon.Settings size={20} />
      </RailButton>

      {switcher && (
        <DropdownMenu pos={switcher} onClose={() => setSwitcher(null)}>
          <p className="px-3.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Аккаунты</p>
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-2.5 px-3.5 py-2 ${a.id === user.id ? "bg-accent-soft" : "hover:bg-surface-alt"}`}
            >
              <button onClick={() => switchTo(a.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Avatar name={a.name || a.phone} color={a.avatarColor} image={a.avatarImage} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name || a.phone || a.email}</span>
                  <span className="block truncate text-xs text-muted">{a.phone || a.email}</span>
                </span>
              </button>
              <button
                onClick={() => logoutOne(a.id)}
                className="rounded-full p-1 text-muted hover:bg-border hover:text-danger"
                title="Выйти из аккаунта"
              >
                <Icon.X size={13} />
              </button>
            </div>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => router.push("/login?add=1")}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-accent hover:bg-surface-alt"
          >
            <Icon.Plus size={16} /> Добавить аккаунт
          </button>
        </DropdownMenu>
      )}
    </nav>
  );
}
