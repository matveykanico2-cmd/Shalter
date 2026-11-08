import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, openDm } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { botsQueries, createBot } from "../api/bots";

import { BotTokenDialog, CreateBotDialog } from "./bot-dialogs";

/**
 * «Новый бот» из меню «Новый чат» списка (openNewChatMenu в public/js/views/chatList.js):
 * создать, показать токен и сразу открыть чат с ботом.
 */
export function NewBotFlow({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const close = () => { active.current = false; onClose(); };
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  if (token) return <BotTokenDialog botName={token.name} token={token.token} onClose={close} />;
  return (
    <CreateBotDialog
      onClose={close}
      onSubmit={async (name, avatarImage, description) => {
        const result = await createBot(name, avatarImage, description).catch((err: unknown) => {
          if (active.current) throw err;
          return null;
        });
        if (!result) return;
        const { bot, token: fresh } = result;
        void client.invalidateQueries({ queryKey: botsQueries.mine().queryKey });
        if (!active.current) return;
        setToken({ name: bot.user.name, token: fresh });
        try {
          const { chat } = await openDm(bot.user.id, bot.user.name, bot.user.avatarColor);
          if (!active.current) return;
          void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
          void navigate(`/chat/${chat.id}`);
        } catch (err) {
          if (active.current) toast(errorText(err, "Бот создан, но открыть чат не удалось"), { error: true });
        }
      }}
    />
  );
}
