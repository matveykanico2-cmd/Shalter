import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { type ChatFolder, chatQueries, type ChatSummary, chatTitle, useChatFolders, useChats } from "@/entities/chat";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { publicUrl } from "@/shared/lib/public-link";
import { askConfirm, Avatar, Button, Icon, SettingsPage, SettingsSection, TextField } from "@/shared/ui";

import { createFolder, createFolderInviteLink, deleteFolder, patchFolder, revokeFolderInviteLink } from "../api/chat-folders";

import styles from "./folders.module.css";

const chatName = (c: ChatSummary) => (c.type === "dm" && c.isSaved ? "Избранное" : chatTitle(c));
const TYPE_LABEL: Record<string, string> = { dm: "личный", bot: "бот", group: "группа", channel: "канал" };

/** «Папки с чатами» — renderFolders в public/js/views/settings/index.js; вкладки над списком чатов берут тот же кэш. */
export function FoldersSection() {
  const client = useQueryClient();
  const folders = useChatFolders().data;
  const chats = useChats().data ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!folders) return null;
  const key = chatQueries.folders().queryKey;
  // Правка — сразу в кэше; запрос папок, ушедший раньше, её бы затёр — отменяем.
  const setFolders = (fn: (list: ChatFolder[]) => ChatFolder[]) => {
    void client.cancelQueries({ queryKey: key });
    client.setQueryData(key, (list) => fn(list ?? []));
  };
  const replace = (folder: ChatFolder) => setFolders((list) => list.map((f) => (f.id === folder.id ? folder : f)));
  const guarded = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
    }
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    void guarded(async () => {
      const { folder } = await createFolder(name, []);
      setFolders((list) => [...list, folder]);
      setNewName("");
      setCreating(false);
      setEditingId(folder.id);
    });
  };
  const move = (folder: ChatFolder, delta: number) => {
    const i = folders.findIndex((f) => f.id === folder.id);
    const j = i + delta;
    if (j < 0 || j >= folders.length) return;
    const next = folders.filter((f) => f.id !== folder.id);
    next.splice(j, 0, folder);
    const ordered = next.map((f, idx) => ({ ...f, order: idx }));
    setFolders(() => ordered);
    void guarded(() => Promise.all(ordered.map((f) => patchFolder(f.id, { order: f.order }))));
  };
  const remove = async (folder: ChatFolder) => {
    if (!(await askConfirm(`Удалить папку «${folder.name}»? Сами чаты останутся — пропадёт только папка.`, { okLabel: "Удалить", danger: true }))) return;
    setFolders((list) => list.filter((f) => f.id !== folder.id));
    if (editingId === folder.id) setEditingId(null);
    void guarded(() => deleteFolder(folder.id));
  };

  const editing = folders.find((f) => f.id === editingId) ?? null;

  return (
    <SettingsPage>
      <div className={styles.mediaHeader}>
        <Icon name="Folder" size={56} />
        <p>Создавайте папки для разных групп чатов и быстро переключайтесь между ними — мышью или клавишами Ctrl+1…9.</p>
      </div>
      {!creating ? (
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
        >
          <Icon name="Plus" size={22} />
          Создать папку
        </button>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {folders.length ? (
        <SettingsSection title="Папки" caption="Нажмите на папку, чтобы выбрать, какие чаты в неё входят.">
          {folders.map((f, i) => (
            <div key={f.id} className={f.id === editingId ? `${styles.folderRow} ${styles.open}` : styles.folderRow}>
              <button type="button" className={styles.folderMain} onClick={() => setEditingId(f.id === editingId ? null : f.id)}>
                <span className={styles.folderIcon}>
                  <Icon name="Folder" size={20} />
                </span>
                <span className={styles.folderBody}>
                  <span className={styles.folderName}>{f.name}</span>
                  <span className={styles.muted}>
                    {f.chatIds.length} {plural(f.chatIds.length, "чат", "чата", "чатов")}
                  </span>
                </span>
              </button>
              <button type="button" className={`${styles.iconButton} ${styles.up}`} title="Выше" aria-label="Выше" disabled={i === 0} onClick={() => move(f, -1)}>
                <Icon name="ChevronDown" size={18} />
              </button>
              <button type="button" className={styles.iconButton} title="Ниже" aria-label="Ниже" disabled={i === folders.length - 1} onClick={() => move(f, 1)}>
                <Icon name="ChevronDown" size={18} />
              </button>
              <button type="button" className={`${styles.iconButton} ${styles.danger}`} title="Удалить папку" aria-label="Удалить папку" onClick={() => void remove(f)}>
                <Icon name="Trash" size={18} />
              </button>
            </div>
          ))}
        </SettingsSection>
      ) : null}
      {editing ? <FolderEditor key={editing.id} folder={editing} chats={chats} onChange={replace} guarded={guarded} /> : null}
      {creating ? (
        <form
          className={styles.createRow}
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <TextField
            autoFocus
            maxLength={32}
            value={newName}
            placeholder="Название папки"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
          />
          <Button type="submit">Создать</Button>
        </form>
      ) : null}
    </SettingsPage>
  );
}

type EditorProps = {
  folder: ChatFolder;
  chats: ChatSummary[];
  onChange: (folder: ChatFolder) => void;
  guarded: (fn: () => Promise<unknown>) => Promise<void>;
};

/** Название, чаты папки и ссылка-приглашение (editorFor). */
function FolderEditor({ folder, chats, onChange, guarded }: EditorProps) {
  const [name, setName] = useState(folder.name);
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const list = chats
    .filter((c) => !q || chatName(c).toLowerCase().includes(q))
    .sort((a, b) => Number(folder.chatIds.includes(b.id)) - Number(folder.chatIds.includes(a.id)) || chatName(a).localeCompare(chatName(b), "ru"));

  const rename = () => {
    const next = name.trim();
    if (!next || next === folder.name) return;
    onChange({ ...folder, name: next });
    void guarded(() => patchFolder(folder.id, { name: next }));
  };
  const toggleChat = (chatId: string) => {
    const chatIds = folder.chatIds.includes(chatId) ? folder.chatIds.filter((id) => id !== chatId) : [...folder.chatIds, chatId];
    onChange({ ...folder, chatIds });
    void guarded(() => patchFolder(folder.id, { chatIds }));
  };
  const link = folder.inviteCode ? publicUrl(`/folder/${folder.inviteCode}`) : null;

  return (
    <div className={styles.editor}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Название</span>
        <TextField
          value={name}
          maxLength={32}
          placeholder="Название папки"
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>
      <p className={styles.fieldLabel}>Чаты в папке — {folder.chatIds.length}</p>
      <TextField type="search" value={filter} placeholder="Найти чат" onChange={(e) => setFilter(e.target.value)} />
      <div className={styles.chatList}>
        {list.length ? (
          list.map((c) => (
            <label key={c.id} className={styles.chatCheck}>
              <input type="checkbox" checked={folder.chatIds.includes(c.id)} onChange={() => toggleChat(c.id)} />
              <Avatar name={chatName(c)} color={c.otherUser?.avatarColor ?? c.avatarColor} image={c.otherUser?.avatarImage ?? c.avatarImage} size={28} />
              <span className={styles.chatName}>{chatName(c)}</span>
              <span className={styles.muted}>{TYPE_LABEL[c.type] ?? ""}</span>
            </label>
          ))
        ) : (
          <p className={styles.muted}>Ничего не найдено</p>
        )}
      </div>
      <p className={styles.fieldLabel}>Поделиться папкой</p>
      <p className={styles.muted}>В ссылку попадают только публичные чаты и каналы из этой папки — личные и закрытые группы не показываются.</p>
      {link ? (
        <div className={styles.linkRow}>
          <span className={styles.mono}>{link}</span>
          <button type="button" className={styles.iconButton} title="Скопировать" aria-label="Скопировать" onClick={() => void copyText(link)}>
            <Icon name="Copy" size={16} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.danger}`}
            title="Отозвать"
            aria-label="Отозвать"
            onClick={() => void guarded(async () => onChange((await revokeFolderInviteLink(folder.id)).folder))}
          >
            <Icon name="Trash" size={16} />
          </button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => void guarded(async () => onChange((await createFolderInviteLink(folder.id)).folder))}>
          Создать ссылку
        </Button>
      )}
    </div>
  );
}
