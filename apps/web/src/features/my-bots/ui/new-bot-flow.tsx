import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, openDm } from "@/entities/chat";

import { botsQueries, createBot } from "../api/bots";

import { BotTokenDialog, CreateBotDialog } from "./bot-dialogs";

/**
 * «Новый бот» из меню «Новый чат» списка (openNewChatMenu в public/js/views/chatList.js):
 * создать, показать токен и сразу открыть чат с ботом.
 */
export function NewBotFlow({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  if (token) return <BotTokenDialog botName={token.name} token={token.token} onClose={onClose} />;
  return (
    <CreateBotDialog
      onClose={onClose}
      onSubmit={async (name, avatarImage, description) => {
        const { bot, token: fresh } = await createBot(name, avatarImage, description);
        setToken({ name: bot.user.name, token: fresh });
        void client.invalidateQueries({ queryKey: botsQueries.mine().queryKey });
        const { chat } = await openDm(bot.user.id, bot.user.name, bot.user.avatarColor);
        await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
        void navigate(`/chat/${chat.id}`);
      }}
    />
  );
}
