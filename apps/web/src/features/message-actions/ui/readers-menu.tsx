import { useEffect, useState } from "react";

import type { Message } from "@/entities/message";

import { Menu, type MenuItem } from "@/shared/ui";

import { messageReaders } from "../api/message-actions";
import { readAtLabel } from "../lib/read-at";

type Reader = { id: string; name: string; readAt: string | null };

type Props = {
  message: Message;
  /** Кто прочитал, по readByIds — пока сервер не ответил или если не ответил. */
  fallback: readonly Reader[];
  at: { x: number; y: number };
  onClose: () => void;
};

/** «Прочитали: N» — как showReaders в messageBubble.js: время, если человек его не скрывает. */
export function ReadersMenu({ message, fallback: initial, at, onClose }: Props) {
  // Запасной список — каким он был при открытии: меню не перезапрашивает на каждый рендер ленты.
  const [fallback] = useState(initial);
  const [readers, setReaders] = useState<readonly Reader[] | null>(null);
  useEffect(() => {
    let alive = true;
    messageReaders(message.chatId, message.id).then(
      ({ readers: list }) => alive && setReaders(list.map(({ user, readAt }) => ({ id: user.id, name: user.name, readAt }))),
      () => alive && setReaders(fallback)
    );
    return () => {
      alive = false;
    };
  }, [message.chatId, message.id, fallback]);

  const list = readers ?? fallback;
  const items: MenuItem[] = [
    { label: `Прочитали: ${list.length || fallback.length}` },
    ...list.map((r) => ({ icon: "User" as const, label: r.readAt ? `${r.name} · ${readAtLabel(r.readAt).replace(/^Прочитано /, "")}` : r.name })),
  ];
  return <Menu at={at} label="Прочитали" items={items} onClose={onClose} />;
}
