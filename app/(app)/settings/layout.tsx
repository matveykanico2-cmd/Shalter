"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

const NAV = [
  { href: "/settings", label: "Профиль", icon: Icon.Users },
  { href: "/settings/accounts", label: "Аккаунты", icon: Icon.Accounts },
  { href: "/settings/privacy", label: "Конфиденциальность", icon: Icon.Lock },
  { href: "/settings/notifications", label: "Уведомления", icon: Icon.Bell },
  { href: "/settings/appearance", label: "Внешний вид", icon: Icon.Sun },
  { href: "/settings/folders", label: "Папки", icon: Icon.Archive },
  { href: "/settings/devices", label: "Устройства", icon: Icon.Phone },
  { href: "/settings/data", label: "Данные и память", icon: Icon.Download },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-full w-full">
      <div className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface py-3 md:flex">
        <p className="px-4 pb-2 font-serif text-lg font-semibold">Настройки</p>
        {NAV.map((item) => {
          const active = pathname === item.href;
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-alt hover:text-text"
              }`}
            >
              <ItemIcon size={16} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5 md:hidden">
          <button onClick={() => router.push("/")} className="rounded-full p-1.5 text-muted hover:bg-surface-alt">
            <Icon.ChevronLeft size={20} />
          </button>
          <p className="font-serif text-base font-semibold">Настройки</p>
        </header>
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                pathname === item.href ? "bg-accent text-accent-contrast" : "bg-surface-alt text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
