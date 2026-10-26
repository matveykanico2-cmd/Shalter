// «Печатает…» — по событию сокета, гаснет через 4 с без нового; без сокета раз в 30 с
// спрашиваем сервер (public/js/views/chatView.js).
import { useEffect, useState } from "react";

import { ws } from "@/shared/api";

import { getTyping } from "../api/typing";

/** Кто печатает и что делает (typing, upload_photo, choose_sticker…); null — никто. */
export type Typing = { userId: string; action: string } | null;

const CLEAR_MS = 4000;
const POLL_MS = 30_000;

export function useTyping(chatId: string, meId: string): Typing {
  const [typing, setTyping] = useState<Typing>(null);

  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const off = ws.on("typing:update", ({ chatId: id, userId, action }) => {
      if (id !== chatId || userId === meId) return;
      clearTimeout(clearTimer);
      if (action === "cancel") {
        setTyping((t) => (t?.userId === userId ? null : t));
        return;
      }
      setTyping({ userId, action: action || "typing" });
      clearTimer = setTimeout(() => setTyping(null), CLEAR_MS);
    });
    // Пришло сообщение от того, кто печатал, — подпись гаснет сразу (clearTypingStatus).
    const offMessage = ws.on("message:new", ({ chatId: id, message }) => {
      if (id !== chatId) return;
      setTyping((t) => (t && message.senderId === t.userId ? null : t));
    });
    const poll = setInterval(() => {
      if (document.hidden || ws.isOpen()) return;
      getTyping(chatId)
        .then((r) => setTyping(r.typingUserId && r.typingUserId !== meId ? { userId: r.typingUserId, action: r.typingAction ?? "typing" } : null))
        .catch(() => {});
    }, POLL_MS);
    return () => {
      off();
      offMessage();
      clearTimeout(clearTimer);
      clearInterval(poll);
    };
  }, [chatId, meId]);

  return typing;
}
