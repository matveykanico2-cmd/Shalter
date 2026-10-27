import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { chatQueries } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button } from "@/shared/ui";

import { folderInviteQuery, importFolder } from "../api/folder-invite";

import styles from "./folder-invite-view.module.css";

/** Приглашение в папку /folder/:code — public/js/views/folderInvite.js. */
export function FolderInviteView() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const invite = useQuery(folderInviteQuery(code));
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const error = importError ?? (invite.isError ? errorText(invite.error, "Ссылка недействительна") : null);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await importFolder(code);
      setImported(true);
      await client.refetchQueries({ queryKey: chatQueries.baseKey }).catch(() => {});
    } catch (err) {
      setImportError(errorText(err, "Не удалось добавить папку"));
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Ссылка не работает</h1>
        <p className={styles.hint}>{error}</p>
        <Button onClick={() => void navigate("/")}>К чатам</Button>
      </div>
    );
  }
  const info = invite.data;
  if (!info) return null;
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Папка «{info.name}»</h1>
      <p className={styles.hint}>{info.chats.length ? `${info.chats.length} чатов и каналов` : "В папке нет публичных чатов — добавить будет нечего"}</p>
      {info.chats.length ? (
        <div className={styles.chats}>
          {info.chats.map((c) => (
            <div key={c.id} className={styles.chat}>
              <Avatar size={32} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
              <p className={styles.chatTitle}>{c.title}</p>
            </div>
          ))}
        </div>
      ) : null}
      {imported ? (
        <Button onClick={() => void navigate("/")}>Готово — открыть чаты</Button>
      ) : (
        <Button disabled={busy || !info.chats.length} onClick={() => void add()}>
          {busy ? "Добавляем…" : "Добавить папку себе"}
        </Button>
      )}
      <Button variant="link" onClick={() => void navigate("/")}>
        Не сейчас
      </Button>
    </div>
  );
}
