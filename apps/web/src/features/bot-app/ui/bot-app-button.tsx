import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/shared/ui";

import { botAppQueries } from "../api/bot-app";

import styles from "./bot-app.module.css";
import { MiniApp } from "./mini-app";

/** Приложение бота кнопкой в шапки лички с ботом (chat-header-app-btn). */
export function BotAppButton({ bot, chatId }: { bot: { id: string; name: string }; chatId: string }) {
  const app = useQuery(botAppQueries.audience(bot.id)).data?.app;
  const [open, setOpen] = useState(false);
  if (!app) return null;
  return (
    <>
      <button type="button" className={styles.headerButton} title={app.name} onClick={() => setOpen(true)}>
        <Icon name="Code" size={15} />
        <span className={styles.headerLabel}>{app.name}</span>
      </button>
      {open ? <MiniApp target={{ botId: bot.id, botName: bot.name, chatId, appName: app.name }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
