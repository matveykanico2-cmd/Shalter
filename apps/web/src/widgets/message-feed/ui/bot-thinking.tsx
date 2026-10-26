import { useEffect, useState } from "react";

import { type ChatMember, type ChatSummary, useTyping } from "@/entities/chat";

import { secondsSince } from "../lib/thinking";

import styles from "./message-feed.module.css";

const SERVICE_BOTS = new Set(["bot_shalter_ai", "bot_support"]);

/**
 * Бот готовит ответ — пузырь «Думает…» с точками и секундомером внизу ленты, чтобы долгая
 * генерация не выглядела зависанием (syncThinking в public/js/views/chatView.js).
 */
export function BotThinking({ chat, members, meId }: { chat: ChatSummary; members: readonly ChatMember[]; meId: string }) {
  const typing = useTyping(chat.id, meId);
  const typist = typing ? (members.find((u) => u.id === typing.userId) ?? (chat.otherUser?.id === typing.userId ? chat.otherUser : null)) : null;
  const thinking = !!typing && (!!typist?.isBot || SERVICE_BOTS.has(typing.userId));
  if (!thinking) return null;
  return <ThinkingBubble key={typing.userId} drawing={typing.action === "upload_photo"} />;
}

function ThinkingBubble({ drawing }: { drawing: boolean }) {
  const [since] = useState(() => secondsSince(0));
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds(secondsSince(since)), 1000);
    return () => clearInterval(t);
  }, [since]);
  return (
    <div className={styles.thinkingRow} role="status">
      <div className={styles.thinking}>
        <span className={styles.thinkingDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{drawing ? "Рисует картинку…" : "Думает…"}</span>
        {seconds >= 3 ? <span className={styles.thinkingTime}>{seconds} с</span> : null}
      </div>
    </div>
  );
}
