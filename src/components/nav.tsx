"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Bookmark,
  Clapperboard,
  Compass,
  Heart,
  House,
  Menu,
  Moon,
  Search,
  Send,
  Settings,
  SquarePlus,
  SquarePlay,
  Plus,
  Sun,
  Aperture,
  LogOut,
  Scale,
  ShieldCheck,
  UserRoundPlus,
  Check,
  Users,
  Radio,
  Bot,
} from "lucide-react";
import { api, BASE_PATH } from "@/lib/client";
import { useApp } from "./app-context";
import { SidePanel } from "./panels";
import { Avatar, Modal } from "./ui";

export function Logo({ className = "" }: { className?: string }) {
  return <span className={`flex items-center gap-2 font-logo text-[32px] leading-none ${className}`}><BrandMark size={28} />shalter</span>;
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return <span aria-hidden="true" className="brand-mark inline-flex shrink-0 items-center justify-center rounded-[35%] text-white" style={{ width: size, height: size }}><span className="text-[0.72em] font-black leading-none">S</span></span>;
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-[#ff3040] px-1 text-[11px] font-bold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Dot({ show }: { show: boolean }) {
  return show ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-bg bg-[#ff3040]" /> : null;
}

function useTheme() {
  // Only rendered after a click, so reading the DOM here is safe.
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("snapgram:theme", next);
    } catch {}
    setTheme(next);
  };
  return [theme, toggle] as const;
}

function AccountsModal({ onClose }: { onClose: () => void }) {
  const { me } = useApp();
  const router = useRouter();
  const [accounts, setAccounts] = useState<{ id: number; username: string; name: string; avatar: string | null }[]>([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ accounts: typeof accounts }>("/api/auth/accounts").then((d) => setAccounts(d.accounts)).catch(() => {}), []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/accounts", { method: "POST", body: { login, password } });
      setLogin("");
      setPassword("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (id: number) => {
    if (id === me.id) return;
    await api("/api/auth/accounts", { method: "POST", body: { action: "switch", userId: id } });
    window.location.reload();
  };

  return (
    <Modal onClose={onClose} showClose={false} className="w-[390px] max-w-full">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><div className="font-semibold">Accounts</div><div className="text-xs text-muted">Switch without logging out</div></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2">
        {accounts.map((account) => (
          <button key={account.id} onClick={() => void switchTo(account.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover">
            <Avatar src={account.avatar} size={42} />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{account.username}</span><span className="block truncate text-xs text-muted">{account.name}</span></span>
            {account.id === me.id && <Check size={18} className="text-link" />}
          </button>
        ))}
      </div>
      <form onSubmit={add} className="border-t border-border p-4">
        <div className="mb-3 text-sm font-semibold">Add account</div>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Username or email" className="mb-2 w-full rounded-lg bg-field px-3 py-2 outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="mb-3 w-full rounded-lg bg-field px-3 py-2 outline-none" />
        {error && <div className="mb-2 text-xs text-danger">{error}</div>}
        <button disabled={busy || !login || password.length < 6} className="flex w-full items-center justify-center gap-2 rounded-lg bg-link px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><UserRoundPlus size={16} />{busy ? "Adding..." : "Add account"}</button>
      </form>
      <button onClick={() => { onClose(); router.push("/accounts/emailsignup?add=1"); }} className="w-full border-t border-border px-4 py-4 text-center text-sm font-semibold text-link hover:bg-hover">Create a new account</button>
    </Modal>
  );
}

function MoreMenu({ onClose, mobile = false }: { onClose: () => void; mobile?: boolean }) {
  const { me } = useApp();
  const router = useRouter();
  const [theme, toggleTheme] = useTheme();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = (icon: ReactNode, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} role="menuitem" className="flex w-full items-center gap-3 rounded-lg p-4 text-left hover:bg-hover">
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="More actions"
      className={`animate-fade z-50 rounded-2xl bg-elevated p-2 shadow-[0_4px_12px_rgba(0,0,0,0.15)] ${
        mobile ? "fixed bottom-[calc(78px+env(safe-area-inset-bottom))] left-3 right-3 w-auto" : "absolute bottom-16 left-3 w-[266px]"
      }`}
    >
      {item(<Settings size={18} />, "Settings", () => (onClose(), router.push("/accounts/edit")))}
      {item(<UserRoundPlus size={18} />, "Switch accounts", () => setAccountsOpen(true))}
      {item(<Bookmark size={18} />, "Saved", () => (onClose(), router.push(`/${me.username}?tab=saved`)))}
      {item(<Scale size={18} />, "Reconciliation", () => (onClose(), router.push("/reconcile")))}
      {me.phone?.replace(/[\s()-]/g, "") === "+797819827502" && item(<ShieldCheck size={18} />, "Admin panel", () => (onClose(), router.push("/admin")))}
      {item(theme === "dark" ? <Sun size={18} /> : <Moon size={18} />, "Switch appearance", toggleTheme)}
      <div className="my-2 h-1.5 bg-separator" />
      {item(<LogOut size={18} />, "Log out", async () => {
        await api("/api/auth/logout", { method: "POST" });
        window.location.replace(`${BASE_PATH}/accounts/login`);
      })}
      {accountsOpen && <AccountsModal onClose={() => setAccountsOpen(false)} />}
    </div>
  );
}

export function Sidebar() {
  const { me, unread, setCreateOpen } = useApp();
  const pathname = usePathname();
  // Path-dependent links can be prerendered from a different URL during an RSC refresh.
  // Keep the first server/client tree identical, then reveal the real navigation.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [panel, setPanel] = useState<"search" | "notifications" | null>(null);
  const [more, setMore] = useState(false);
  // Close the side panel after navigating.
  const [panelPath, setPanelPath] = useState(pathname);
  if (panelPath !== pathname) {
    setPanelPath(pathname);
    setPanel(null);
  }

  const narrow = panel !== null || pathname.startsWith("/direct");
  const is = (p: string) => !panel && (p === "/" ? pathname === "/" : pathname.startsWith(p));

  const items: { label: string; icon: (active: boolean) => ReactNode; href?: string; onClick?: () => void; active: boolean }[] = [
    { label: "Home", href: "/", active: is("/"), icon: (a) => <House size={26} strokeWidth={a ? 2.6 : 1.8} /> },
    {
      label: "Search",
      onClick: () => setPanel((p) => (p === "search" ? null : "search")),
      active: panel === "search",
      icon: (a) => <Search size={26} strokeWidth={a ? 2.8 : 1.8} />,
    },
    { label: "Explore", href: "/explore", active: is("/explore"), icon: (a) => <Compass size={26} strokeWidth={a ? 2.6 : 1.8} /> },
    { label: "Reels", href: "/reels", active: is("/reels"), icon: (a) => <Clapperboard size={26} strokeWidth={a ? 2.6 : 1.8} /> },
    {
      label: "Messages",
      href: "/direct/inbox",
      active: is("/direct"),
      icon: (a) => (
        <span className="relative">
          <Send size={26} strokeWidth={a ? 2.6 : 1.8} />
          <Badge count={unread.messages} />
        </span>
      ),
    },
    { label: "Communities", href: "/communities", active: is("/communities"), icon: (a) => <Users size={26} strokeWidth={a ? 2.6 : 1.8} /> },
    { label: "Channels", href: "/channels", active: is("/channels"), icon: (a) => <Aperture size={26} strokeWidth={a ? 2.6 : 1.8} /> },
    { label: "Live", href: "/live", active: is("/live"), icon: (a) => <Radio size={26} strokeWidth={a ? 2.6 : 1.8} className={a ? "text-danger" : ""} /> },
    { label: "Bots", href: "/bots", active: is("/bots"), icon: (a) => <Bot size={26} strokeWidth={a ? 2.6 : 1.8} /> },
    {
      label: "Notifications",
      onClick: () => setPanel((p) => (p === "notifications" ? null : "notifications")),
      active: panel === "notifications",
      icon: (a) => (
        <span className="relative">
          <Heart size={26} strokeWidth={a ? 2.8 : 1.8} className={a ? "fill-current" : ""} />
          <Dot show={unread.notifications > 0} />
        </span>
      ),
    },
    { label: "Create", onClick: () => setCreateOpen(true), active: false, icon: () => <SquarePlus size={26} strokeWidth={1.8} /> },
    {
      label: "Profile",
      href: `/${me.username}`,
      active: is(`/${me.username}`),
      icon: (a) => (
        <span className={`rounded-full ${a ? "ring-2 ring-fg ring-offset-1 ring-offset-bg" : ""}`}>
          <Avatar src={me.avatar} size={26} />
        </span>
      ),
    },
  ];

  const label = (text: string, active: boolean) => (
    <span className={`${narrow ? "hidden" : "hidden xl:inline"} ${active ? "font-bold" : ""} text-base`}>{text}</span>
  );

  if (!hydrated) {
    return <nav aria-hidden="true" className="fixed bottom-0 left-0 top-0 z-40 hidden w-[72px] flex-col border-r border-separator bg-bg px-3 pb-5 pt-2 md:flex" />;
  }

  return (
    <>
      <nav
        className={`fixed bottom-0 left-0 top-0 z-40 hidden flex-col border-r border-separator bg-bg px-3 pb-5 pt-2 md:flex ${
          narrow ? "w-[72px]" : "w-[72px] xl:w-[244px]"
        }`}
      >
        <Link href="/" className="mb-5 flex h-[73px] items-center px-3 pt-4">
          <Logo className={narrow ? "hidden" : "hidden xl:block"} />
          <Aperture size={26} className={narrow ? "block" : "xl:hidden"} />
        </Link>
        <div className="flex flex-1 flex-col gap-1">
          {items.map((it) => {
            const inner = (
              <>
                <span className="transition-transform group-hover:scale-105">{it.icon(it.active)}</span>
                {label(it.label, it.active)}
              </>
            );
            const cls = "group flex items-center gap-4 rounded-lg p-3 hover:bg-hover";
            return it.href ? (
              <Link key={it.label} href={it.href} className={cls} title={it.label}>
                {inner}
              </Link>
            ) : (
              <button
                key={it.label}
                onClick={it.onClick}
                className={`${cls} ${it.active ? "outline outline-1 outline-border" : ""}`}
                title={it.label}
              >
                {inner}
              </button>
            );
          })}
        </div>
        <button onClick={() => setMore((m) => !m)} className="group flex items-center gap-4 rounded-lg p-3 hover:bg-hover" title="More">
          <Menu size={26} strokeWidth={more ? 2.6 : 1.8} />
          {label("More", more)}
        </button>
        {more && <MoreMenu onClose={() => setMore(false)} />}
      </nav>
      {panel && <SidePanel kind={panel} onClose={() => setPanel(null)} />}
    </>
  );
}

/** Phone layout: the Instagram app's floating "glass" tab bar (Home, Reels, Messages, Search, Profile). */
export function BottomNav() {
  const { me, unread } = useApp();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const dark = pathname.startsWith("/reels");
  const active = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));
  const tab = (href: string, label: string, on: boolean, icon: ReactNode) => (
    <Link
      href={href}
      aria-label={label}
      className={`flex flex-1 items-center justify-center rounded-full ${on ? (dark ? "bg-white/15" : "bg-fg/10") : ""}`}
    >
      {icon}
    </Link>
  );
  const w = (on: boolean) => (on ? 2.4 : 1.8);
  return (
    <>
    <nav
      className={`fixed inset-x-3 bottom-[max(8px,env(safe-area-inset-bottom))] z-40 flex h-[62px] gap-1 rounded-full border p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-xl md:hidden ${
        dark ? "border-white/10 bg-[#1c1f24]/80 text-white" : "border-fg/10 bg-bg/80"
      }`}
    >
      {tab("/", "Home", active("/"), <House size={26} strokeWidth={w(active("/"))} fill={active("/") ? "currentColor" : "none"} />)}
      {tab("/reels", "Reels", active("/reels"), <SquarePlay size={26} strokeWidth={w(active("/reels"))} />)}
      {tab(
        "/direct/inbox",
        "Messages",
        active("/direct"),
        <span className="relative">
          <Send size={26} strokeWidth={w(active("/direct"))} />
          <Dot show={unread.messages > 0} />
        </span>,
      )}
      {tab("/explore", "Search", active("/explore"), <Search size={26} strokeWidth={w(active("/explore"))} />)}
      {tab(
        `/${me.username}`,
        "Profile",
        active(`/${me.username}`),
        <span className={`rounded-full ${active(`/${me.username}`) ? "ring-2 ring-current ring-offset-1 ring-offset-transparent" : ""}`}>
          <Avatar src={me.avatar} size={28} />
        </span>,
      )}
      <button type="button" onClick={() => setMore((value) => !value)} aria-label="More" className={`flex flex-1 items-center justify-center rounded-full ${more ? (dark ? "bg-white/15" : "bg-fg/10") : ""}`}>
        <Menu size={25} strokeWidth={more ? 2.5 : 1.8} />
      </button>
    </nav>
    {more && <MoreMenu mobile onClose={() => setMore(false)} />}
    </>
  );
}

/** Phone header on the home feed, like the Instagram app: create, centered logo, notifications. */
export function MobileHomeHeader() {
  const { unread, setCreateOpen } = useApp();
  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center justify-between bg-bg px-4 md:hidden">
      <button onClick={() => setCreateOpen(true)} aria-label="Create">
        <Plus size={30} strokeWidth={1.8} />
      </button>
      <Logo className="text-[30px]" />
      <Link href="/notifications" className="relative" aria-label="Notifications">
        <Heart size={28} strokeWidth={1.8} />
        <Dot show={unread.notifications > 0} />
      </Link>
    </header>
  );
}
