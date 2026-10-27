import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, EmojiText, Icon } from "@/shared/ui";

import { joinByInvite, openProfileQueries } from "../api/open-profile";

import styles from "./open-profile.module.css";

/** Пригласительная ссылка /join/код — public/js/views/joinInvite.js: чат, «Присоединиться» или заявка. */
export function JoinInviteScreen({ code }: { code: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery(openProfileQueries.invite(code));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const chat = info.data?.chat;
  const error = joinError ?? (info.isError ? errorText(info.error, "Ссылка недействительна") : chat?.banned ? "Вас заблокировали в этом чате" : null);

  if (error) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.screenTitle}>Ссылка не работает</h1>
        <p className={styles.muted}>{error}</p>
        <Button onClick={() => void navigate("/")}>К чатам</Button>
      </div>
    );
  }
  if (!chat) return null;
  const isChannel = chat.type === "channel";
  const requested = pending || chat.requestPending;

  const join = async () => {
    setBusy(true);
    try {
      const res = await joinByInvite(code);
      if ("pending" in res) {
        setPending(true);
        setBusy(false);
        return;
      }
      await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
      void navigate(`/chat/${res.chat.id}`);
    } catch (err) {
      setJoinError(errorText(err, "Не удалось присоединиться"));
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Avatar size={88} name={chat.title ?? ""} color={chat.avatarColor} image={chat.avatarImage} />
      <h1 className={styles.screenTitle}>
        <EmojiText text={chat.title ?? ""} />
        {chat.isVerified ? (
          <span className={styles.verified} title="Подтверждённый аккаунт">
            <Icon name="Verified" size={18} />
          </span>
        ) : null}
      </h1>
      <p className={styles.muted}>
        {chat.memberCount} {isChannel ? "подписчиков" : "участников"}
      </p>
      {chat.description ? <p className={styles.description}>{chat.description}</p> : null}
      {chat.alreadyMember ? (
        <Button onClick={() => void navigate(`/chat/${chat.id}`)}>Открыть</Button>
      ) : requested ? (
        <p className={styles.muted}>Заявка отправлена — администратор её рассмотрит, и чат появится в списке.</p>
      ) : (
        <Button disabled={busy} onClick={() => void join()}>
          {busy ? "Отправляем…" : chat.approveJoins ? "Подать заявку" : `Присоединиться к ${isChannel ? "каналу" : "группе"}`}
        </Button>
      )}
      {!chat.alreadyMember && chat.approveJoins && !requested ? <p className={styles.muted}>Вступление по заявке — админ должен её одобрить.</p> : null}
      <Button variant="link" onClick={() => void navigate("/")}>
        Не сейчас
      </Button>
    </div>
  );
}
