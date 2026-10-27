import { useState } from "react";

import { chatTitle, useChats } from "@/entities/chat";

import { http } from "@/shared/api";
import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, Dialog, toast } from "@/shared/ui";

import styles from "./invite-dialog.module.css";

type Props = { url: string; callChatId: string; onClose: () => void };

/** «Пригласить в звонок»: ссылка — скопировать, поделиться или сразу в один из последних чатов. */
export function InviteDialog({ url, callChatId, onClose }: Props) {
  const recent = (useChats().data ?? []).filter((c) => !c.archived && c.id !== callChatId).slice(0, 8);
  const text = `📞 Присоединяйтесь к звонку в Shalter: ${url}`;
  const canShare = typeof navigator.share === "function";
  return (
    <Dialog title="Пригласить в звонок" onClose={onClose} className={styles.dialog}>
      <p className={styles.hint}>Любой, у кого есть ссылка и аккаунт Shalter, сможет присоединиться, пока звонок идёт.</p>
      <div className={styles.link}>{url.replace(/^https?:\/\//, "")}</div>
      <div className={styles.actions}>
        <Button onClick={() => void copyText(url, "Ссылка скопирована")}>Копировать</Button>
        {canShare ? (
          <Button variant="secondary" onClick={() => void navigator.share({ title: "Звонок в Shalter", text, url }).catch(() => {})}>
            Поделиться
          </Button>
        ) : null}
      </div>
      {recent.length ? <p className={styles.section}>Отправить в чат</p> : null}
      <div className={styles.chats}>
        {recent.map((c) => (
          <SendRow key={c.id} chatId={c.id} name={chatTitle(c)} color={c.otherUser?.avatarColor ?? c.avatarColor} image={c.otherUser?.avatarImage ?? c.avatarImage} text={text} />
        ))}
      </div>
      <Button variant="secondary" onClick={onClose}>
        Готово
      </Button>
    </Dialog>
  );
}

type RowProps = { chatId: string; name: string; color?: string | null; image?: string | null; text: string };

function SendRow({ chatId, name, color, image, text }: RowProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const send = async () => {
    setState("sending");
    try {
      const clientId = `ci_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/messages`, { text, clientId });
      setState("sent");
    } catch (err) {
      setState("idle");
      toast(errorText(err, "Не удалось отправить"), { error: true });
    }
  };
  return (
    <div className={styles.chat}>
      <Avatar size={36} name={name} color={color} image={image} />
      <span className={styles.chatName}>{name}</span>
      <button type="button" className={styles.send} disabled={state !== "idle"} onClick={() => void send()}>
        {state === "sent" ? "Отправлено ✓" : "Отправить"}
      </button>
    </div>
  );
}
