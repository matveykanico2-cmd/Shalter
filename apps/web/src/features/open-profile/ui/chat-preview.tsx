import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries } from "@/entities/chat";
import { type Message, MessageBubble } from "@/entities/message";

import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { Avatar, Button, EmojiText, Icon, toast } from "@/shared/ui";

import { joinPublicChat, openProfileQueries } from "../api/open-profile";

import styles from "./open-profile.module.css";

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

const runs = (a: Message | undefined, b: Message | undefined) => !!a && !!b && a.senderId === b.senderId && a.type !== "system" && b.type !== "system" && sameDay(a.createdAt, b.createdAt);

/**
 * Публичный канал или группа, где вы ещё не состоите (public/js/views/chatPreview.js):
 * лента только для чтения, внизу — «Подписаться» / «Вступить» / «Подать заявку».
 */
export function ChatPreview({ chatId, msg }: { chatId: string; msg: string | null }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const preview = useQuery(openProfileQueries.preview(chatId));
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const target = `/chat/${chatId}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`;
  const member = !!preview.data?.chat.isMember;
  useEffect(() => {
    if (member) void navigate(target, { replace: true });
  }, [member, navigate, target]);

  if (preview.isError) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.screenTitle}>Чат недоступен</h1>
        <p className={styles.muted}>{errorText(preview.error, "Не удалось открыть чат")}</p>
        <Button onClick={() => void navigate("/")}>К чатам</Button>
      </div>
    );
  }
  if (!preview.data || member) return null;
  const { chat, messages, senders } = preview.data;
  const isChannel = chat.type === "channel";
  const pending = requested || chat.requestPending;
  const byId = new Map(senders.map((u) => [u.id, u]));
  const label = pending ? "ЗАЯВКА ОТПРАВЛЕНА" : chat.approveJoins ? "ПОДАТЬ ЗАЯВКУ" : isChannel ? "ПОДПИСАТЬСЯ" : "ВСТУПИТЬ В ГРУППУ";

  const join = async () => {
    setBusy(true);
    try {
      const res = await joinPublicChat(chat.id);
      if ("pending" in res) {
        setRequested(true);
        toast(isChannel ? "Заявка на вступление в канал отправлена" : "Заявка на вступление в группу отправлена");
      } else {
        await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
        void navigate(target, { replace: true });
      }
    } catch (err) {
      toast(errorText(err, "Не удалось вступить"), { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.preview} aria-label={chat.title ?? ""}>
      <header className={styles.previewHeader}>
        <button type="button" className={styles.back} title="Назад" onClick={() => void navigate("/")}>
          <Icon name="ChevronLeft" size={20} />
        </button>
        <Avatar size={38} name={chat.title ?? ""} color={chat.avatarColor} image={chat.avatarImage} />
        <div className={styles.previewTitles}>
          <p className={styles.previewTitle}>
            <EmojiText text={chat.title ?? ""} />
            {chat.isVerified ? (
              <span className={styles.verified} title="Подтверждённый аккаунт">
                <Icon name="Verified" size={15} />
              </span>
            ) : null}
          </p>
          <p className={styles.muted}>
            {chat.subscribers}{" "}
            {isChannel ? plural(chat.subscribers, "подписчик", "подписчика", "подписчиков") : plural(chat.subscribers, "участник", "участника", "участников")}
          </p>
        </div>
      </header>
      <div className={styles.previewList} role="log" aria-label="Сообщения">
        {chat.description ? (
          <div className={styles.about}>
            <p className={styles.aboutTitle}>{isChannel ? "О канале" : "О группе"}</p>
            <p>{chat.description}</p>
          </div>
        ) : null}
        {messages.length ? null : <p className={styles.muted}>{isChannel ? "В канале пока нет постов" : "В группе пока нет сообщений"}</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          return (
            <div key={m.id} className={styles.previewRow}>
              {!prev || !sameDay(prev.createdAt, m.createdAt) ? (
                <div className={styles.day}>
                  <span>{dayLabel(m.createdAt)}</span>
                </div>
              ) : null}
              <MessageBubble
                message={m}
                mine={false}
                sender={byId.get(m.senderId) ?? null}
                showSender={!isChannel && !runs(prev, m)}
                showAvatar={!isChannel ? !runs(m, next) : undefined}
                groupStart={!runs(prev, m)}
                groupEnd={!runs(m, next)}
                isChannel={isChannel}
              />
            </div>
          );
        })}
      </div>
      <div className={styles.previewBottom}>
        <button type="button" className={styles.join} disabled={busy || pending} onClick={() => void join()}>
          {busy ? "…" : label}
        </button>
      </div>
    </section>
  );
}
