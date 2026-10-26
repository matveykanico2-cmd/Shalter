import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { useChats } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";
import { openUserProfile } from "@/entities/user";

import { Button } from "@/shared/ui";

import { resolveQuery } from "../lib/resolve-username";
import { useOpenDm } from "../model/use-open-dm";

import { ChatPreview } from "./chat-preview";
import styles from "./open-profile.module.css";

type Props = { handle: string; me: SelfUser; search: URLSearchParams };

/**
 * Ссылка /u/имя или /@имя — как openByUsername в public/js/app.js (t.me/имя): свой ник —
 * «Избранное», человек — его профиль (поверх лички, если она есть, иначе поверх пустого
 * экрана), бот — чат с ним, канал или группа — лента, а если вы ещё не там — превью со «Вступить».
 */
export function UsernameScreen({ handle, me, search }: Props) {
  const navigate = useNavigate();
  const chats = useChats().data;
  const resolved = useQuery(resolveQuery(handle, me.username)).data;
  const openDm = useOpenDm();
  const msg = search.get("msg");
  const startPayload = search.get("start");
  // Переходим один раз: открытие лички с ботом создаёт чат и шлёт /start.
  const done = useRef(false);

  const user = resolved?.kind === "user" ? resolved.user : null;
  const dm = user && !user.isBot ? chats?.find((c) => c.type === "dm" && c.otherUser?.id === user.id) : undefined;
  useEffect(() => {
    if (!resolved || !chats || done.current) return;
    if (resolved.kind === "saved") {
      done.current = true;
      const saved = chats.find((c) => c.isSaved);
      void navigate(saved ? `/chat/${saved.id}` : "/", { replace: true });
    } else if (resolved.kind === "user" && resolved.user.isBot) {
      done.current = true;
      void openDm(resolved.user, { replace: true, startPayload });
    } else if (resolved.kind === "user") {
      done.current = true;
      // Личка уже есть — открываем её, профиль поверх.
      if (dm) void navigate(`/chat/${dm.id}`, { replace: true });
      openUserProfile(resolved.user.id);
    } else if (resolved.kind === "chat" && resolved.chat.isMember) {
      done.current = true;
      void navigate(`/chat/${resolved.chat.id}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`, { replace: true });
    }
  }, [resolved, chats, dm, msg, startPayload, navigate, openDm]);

  if (!resolved) return null;
  if (resolved.kind === "missing") {
    return (
      <div className={styles.screen}>
        <p className={styles.screenTitle}>Ничего не найдено</p>
        <p className={styles.muted}>@{handle} — такого аккаунта, бота или канала нет.</p>
        <Button onClick={() => void navigate("/")}>К чатам</Button>
      </div>
    );
  }
  if (resolved.kind === "chat" && !resolved.chat.isMember) return <ChatPreview chatId={resolved.chat.id} msg={msg} />;
  if (user && !user.isBot && chats && !dm) return <div className={styles.screen} />;
  return null;
}
