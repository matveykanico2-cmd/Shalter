import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, type ChatSummary, useChats } from "@/entities/chat";

import { uploadFile,type UploadKind } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, Icon, TextField, toast } from "@/shared/ui";

import { sendShared, type SharePayload } from "../api/share";
import { base64ToFile, formatSize, kindFor } from "../lib/share-file";
import { closeShare, openShareFromToken, takePendingShare, useShare } from "../model/share-store";

import styles from "./share-inbox.module.css";

// У лички своего названия нет — подписываем именем собеседника.
function chatTitleOf(chat: ChatSummary) {
  if (chat.isSaved) return "Избранное";
  return (chat.otherUser?.name || chat.title || "").trim();
}

/** Окно «Поделиться в Shalter», когда оно открыто; плюс отправка, отложенная до входа. */
export function ShareInboxHost() {
  const share = useShare();
  useEffect(() => {
    const pending = takePendingShare();
    if (pending) void openShareFromToken(pending);
  }, []);
  return share ? <ShareInboxDialog key={share.id} share={share.share} onClose={closeShare} /> : null;
}

/**
 * «Поделиться в Shalter» — openShareInboxDialog в public/js/components/shareInboxDialog.js:
 * содержимое из системного меню (ссылка, текст или файл) и чаты — отправляем в выбранный.
 */
function ShareInboxDialog({ share, onClose }: { share: SharePayload; onClose: () => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const chats = useChats().data;
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const file = useMemo(() => (share.file ? base64ToFile(share.file) : null), [share.file]);
  const kind = file ? kindFor(file) : null;

  const send = async (chat: ChatSummary) => {
    if (sending) return;
    setSending(true);
    try {
      const attachments = file && kind ? [await uploadFile(file, kind as UploadKind)] : [];
      const text = share.text && share.text !== share.url ? share.text : (share.url ?? "");
      await sendShared(chat.id, text, attachments);
      onClose();
      void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
      void navigate(`/chat/${chat.id}`);
      toast(`Отправлено в «${chatTitleOf(chat) || "чат"}»`);
    } catch (err) {
      setSending(false);
      toast(errorText(err, "Не удалось отправить"), { error: true });
    }
  };

  const q = query.trim().toLowerCase();
  const rows = (chats ?? [])
    .filter((c) => !c.archived && c.type !== "channel")
    .filter((c) => !q || `${chatTitleOf(c)} ${c.username ?? c.otherUser?.username ?? ""}`.toLowerCase().includes(q))
    .slice(0, 40);

  return (
    <Dialog title="Поделиться в Shalter" onClose={onClose} className={styles.dialog}>
      <div className={styles.preview}>
        {file ? (
          <div className={styles.file}>
            <Icon name={kind === "image" ? "Image" : kind === "video" ? "Video" : "Paperclip"} size={20} />
            <div>
              <p className={styles.fileName}>{file.name}</p>
              <p className={styles.hint}>{`${kind === "image" ? "Фото" : kind === "video" ? "Видео" : "Файл"} · ${formatSize(file.size)}`}</p>
            </div>
          </div>
        ) : (
          <p className={styles.text}>{share.text || share.url || ""}</p>
        )}
        {share.url && share.text ? <p className={styles.link}>{share.url}</p> : null}
      </div>
      <TextField value={query} placeholder="Поиск чата" aria-label="Поиск чата" autoFocus onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.list}>
        {rows.length ? (
          rows.map((chat) => (
            <button key={chat.id} type="button" className={styles.row} disabled={sending} onClick={() => void send(chat)}>
              <span className={styles.avatar}>{(chatTitleOf(chat) || "?").charAt(0).toUpperCase()}</span>
              <div>
                <p className={styles.rowTitle}>{chatTitleOf(chat) || "Без названия"}</p>
                <p className={styles.hint}>{chat.type === "group" ? "Группа" : "Личный чат"}</p>
              </div>
            </button>
          ))
        ) : (
          <p className={styles.empty}>{q ? "Ничего не найдено" : "Нет доступных чатов"}</p>
        )}
      </div>
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
