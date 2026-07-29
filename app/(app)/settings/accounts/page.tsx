"use client";

import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/icons";
import { useCurrentUser, useAccounts } from "@/lib/client/CurrentUserContext";
import { api } from "@/lib/client/api";

export default function AccountsSettingsPage() {
  const me = useCurrentUser();
  const accounts = useAccounts();
  const router = useRouter();

  async function switchTo(uid: string) {
    if (uid === me.id) return;
    await api.switchAccount(uid);
    router.push("/");
    router.refresh();
  }

  async function logout(uid: string) {
    const label = uid === me.id ? "Выйти из этого аккаунта?" : "Выйти из этого аккаунта на этом устройстве?";
    if (!confirm(label)) return;
    const { remaining } = await api.logout(uid);
    if (remaining.length === 0) {
      window.location.href = "/login";
    } else {
      router.refresh();
    }
  }

  async function logoutAll() {
    if (!confirm("Выйти из всех аккаунтов на этом устройстве?")) return;
    await api.logout();
    window.location.href = "/login";
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Аккаунты</p>
      <p className="mb-4 text-sm text-muted">Аккаунты, открытые на этом устройстве</p>

      <div className="flex flex-col gap-2">
        {accounts.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              a.id === me.id ? "border-accent bg-accent-soft" : "border-border bg-surface"
            }`}
          >
            <button onClick={() => switchTo(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Avatar name={a.name || a.phone} color={a.avatarColor} image={a.avatarImage} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {a.name || a.phone || a.email}
                  {a.id === me.id && <span className="ml-1.5 font-normal text-muted">(текущий)</span>}
                </span>
                <span className="block truncate text-xs text-muted">{a.phone || a.email}</span>
              </span>
            </button>
            <button
              onClick={() => logout(a.id)}
              className="shrink-0 rounded-full p-1.5 text-muted hover:bg-border hover:text-danger"
              title="Выйти из аккаунта"
            >
              <Icon.LogOut size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push("/login?add=1")}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-accent hover:bg-surface-alt"
      >
        <Icon.Plus size={16} /> Добавить аккаунт
      </button>

      <div className="mt-6 border-t border-border pt-4">
        <button
          onClick={() => logout(me.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-danger/10 py-2.5 text-sm font-medium text-danger hover:bg-danger/15"
        >
          <Icon.LogOut size={16} /> Выйти из текущего аккаунта
        </button>
        {accounts.length > 1 && (
          <button onClick={logoutAll} className="mt-2 w-full py-2 text-center text-xs text-muted hover:text-danger">
            Выйти из всех аккаунтов
          </button>
        )}
      </div>
    </div>
  );
}
