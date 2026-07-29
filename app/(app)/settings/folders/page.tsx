"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { api } from "@/lib/client/api";
import { notifyChatsChanged } from "@/lib/client/refresh";
import type { Folder } from "@/lib/types";
import type { ChatSummary } from "@/lib/data/chat-summary";

export default function FoldersSettingsPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [editing, setEditing] = useState<Folder | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listFolders().then((r) => setFolders(r.folders));
    api.listChats().then((r) => setChats(r.chats));
  }, []);

  async function createFolder() {
    if (!newName.trim()) return;
    const { folder } = await api.createFolder(newName.trim(), []);
    setFolders((f) => [...f, folder]);
    setNewName("");
    setCreating(false);
    setEditing(folder);
    notifyChatsChanged();
  }

  async function toggleChat(folder: Folder, chatId: string) {
    const chatIds = folder.chatIds.includes(chatId)
      ? folder.chatIds.filter((id) => id !== chatId)
      : [...folder.chatIds, chatId];
    const updated = { ...folder, chatIds };
    setEditing(updated);
    setFolders((fs) => fs.map((f) => (f.id === folder.id ? updated : f)));
    await api.patchFolder(folder.id, { chatIds });
    notifyChatsChanged();
  }

  async function remove(folder: Folder) {
    setFolders((fs) => fs.filter((f) => f.id !== folder.id));
    if (editing?.id === folder.id) setEditing(null);
    await api.deleteFolder(folder.id);
    notifyChatsChanged();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Папки с чатами</p>
      <p className="mb-4 text-sm text-muted">До 10 папок, в каждой — любой набор чатов</p>

      <div className="mb-4 flex flex-col gap-1.5">
        {folders.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <button onClick={() => setEditing(editing?.id === f.id ? null : f)} className="flex-1 text-left text-sm font-medium">
              {f.name} <span className="font-mono text-xs text-muted">· {f.chatIds.length}</span>
            </button>
            <button onClick={() => remove(f)} className="rounded-full p-1.5 text-muted hover:text-danger">
              <Icon.Trash size={15} />
            </button>
          </div>
        ))}
      </div>

      {creating ? (
        <div className="mb-4 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название папки"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button onClick={createFolder} className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-contrast">
            Создать
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-accent"
        >
          <Icon.Plus size={15} /> Новая папка
        </button>
      )}

      {editing && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Чаты в папке «{editing.name}»</p>
          <div className="flex flex-col gap-1">
            {chats.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={editing.chatIds.includes(c.id)}
                  onChange={() => toggleChat(editing, c.id)}
                  className="accent-accent"
                />
                {c.title}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
