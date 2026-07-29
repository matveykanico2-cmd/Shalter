"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { Icon } from "./icons";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";
import { notifyChatsChanged } from "@/lib/client/refresh";
import type { Contact, PublicUser } from "@/lib/types";

type ResolvedContact = Contact & { user: PublicUser };

export function ContactsView({
  initialContacts,
  candidateUsers,
}: {
  initialContacts: ResolvedContact[];
  candidateUsers: PublicUser[];
}) {
  const me = useCurrentUser();
  const [contacts, setContacts] = useState(initialContacts);
  const [candidates, setCandidates] = useState(candidateUsers);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => a.user.name.localeCompare(b.user.name, "ru")),
    [contacts]
  );
  const filteredCandidates = candidates.filter(
    (u) => u.name.toLowerCase().includes(query.toLowerCase()) || u.username.toLowerCase().includes(query.toLowerCase())
  );

  async function addContact(u: PublicUser) {
    await api.addContact(u.id);
    setContacts((c) => [
      ...c,
      { id: `ct_${u.id}`, ownerId: me.id, userId: u.id, addedAt: new Date().toISOString(), user: u },
    ]);
    setCandidates((c) => c.filter((x) => x.id !== u.id));
  }

  async function removeContact(u: PublicUser) {
    await api.removeContact(u.id);
    setContacts((c) => c.filter((x) => x.userId !== u.id));
    setCandidates((c) => [...c, u]);
  }

  async function message(u: PublicUser) {
    const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
    notifyChatsChanged();
    router.push(`/chat/${chat.id}`);
  }

  async function call(u: PublicUser) {
    const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
    notifyChatsChanged();
    const { call } = await api.placeCall(chat.id, "audio");
    router.push(`/call/${call.id}`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <p className="font-serif text-lg font-semibold">Контакты</p>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-contrast"
        >
          <Icon.Plus size={15} /> Добавить
        </button>
      </header>

      {adding && (
        <div className="border-b border-border bg-surface-alt px-4 py-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя или @юзернейм"
            className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-col gap-1">
            {filteredCandidates.length === 0 && <p className="py-2 text-sm text-muted">Никого не найдено</p>}
            {filteredCandidates.map((u) => (
              <button
                key={u.id}
                onClick={() => addContact(u)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface"
              >
                <Avatar name={u.name} color={u.avatarColor} image={u.avatarImage} size={32} />
                <span className="text-sm font-medium">{u.name}</span>
                <span className="text-sm text-muted">@{u.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && <p className="mt-10 text-center text-sm text-muted">Список контактов пуст</p>}
        {sorted.map(({ user }) => (
          <div key={user.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt">
            <Avatar name={user.name} color={user.avatarColor} image={user.avatarImage} online={user.online} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">@{user.username}</p>
            </div>
            <button onClick={() => message(user)} className="rounded-full p-2 text-muted hover:bg-surface hover:text-accent" title="Написать">
              <Icon.Send size={16} />
            </button>
            <button onClick={() => call(user)} className="rounded-full p-2 text-muted hover:bg-surface hover:text-accent" title="Позвонить">
              <Icon.Phone size={16} />
            </button>
            <button onClick={() => removeContact(user)} className="rounded-full p-2 text-muted hover:bg-surface hover:text-danger" title="Удалить из контактов">
              <Icon.Trash size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
