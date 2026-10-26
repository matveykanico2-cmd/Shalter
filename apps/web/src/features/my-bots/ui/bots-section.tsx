import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, openDm } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Avatar, Button, Icon, type IconName, SettingsPage, toast } from "@/shared/ui";

import { type Bot, botsQueries, botToken, createBot, deleteBot, regenerateBotToken, setBotCommands } from "../api/bots";

import { BotTokenDialog, CreateBotDialog, EditBotDialog } from "./bot-dialogs";
import styles from "./bots.module.css";

type Shown = { kind: "create" } | { kind: "token"; name: string; token: string; fresh: boolean } | { kind: "edit"; bot: Bot } | null;

/** «Настройки → Боты» (renderBots): как программировать, создать бота, свои боты с токеном и командами. */
export function BotsSection() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const bots = useQuery(botsQueries.mine()).data;
  const [shown, setShown] = useState<Shown>(null);
  const reload = () => client.invalidateQueries({ queryKey: botsQueries.mine().queryKey });
  const fail = (err: unknown, fallback: string) => toast(errorText(err, fallback), { error: true });

  const regenerate = async (b: Bot) => {
    if (!(await askConfirm(`Обновить токен бота «${b.user.name}»? Старый токен перестанет работать.`, { okLabel: "Обновить", danger: true }))) return;
    try {
      const { token } = await regenerateBotToken(b.id);
      setShown({ kind: "token", name: b.user.name, token, fresh: true });
    } catch (err) {
      fail(err, "Не удалось обновить токен");
    }
  };

  const remove = async (b: Bot) => {
    if (!(await askConfirm(`Удалить бота «${b.user.name}» безвозвратно?`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await deleteBot(b.id);
      await reload();
    } catch (err) {
      fail(err, "Не удалось удалить бота");
    }
  };

  const editCommands = async (b: Bot) => {
    const current = b.commands.map((c) => `${c.command} - ${c.description ?? ""}`.trim()).join("\n");
    const next = await askText("Команды бота, по одной в строке:\n\nstart - Начать\nhelp - Помощь", { initial: current, okLabel: "Сохранить" });
    if (next === null) return;
    const commands = next
      .split("\n")
      .map((line) => {
        const [cmd, ...rest] = line.split(/\s*-\s*/);
        return { command: (cmd ?? "").trim(), description: rest.join(" - ").trim() };
      })
      .filter((c) => c.command);
    try {
      await setBotCommands(b.id, commands);
      await reload();
    } catch (err) {
      fail(err, "Не удалось сохранить команды");
    }
  };

  const openChat = async (b: Bot) => {
    try {
      const { chat } = await openDm(b.userId, b.user.name, b.user.avatarColor);
      void navigate(`/chat/${chat.id}`);
    } catch (err) {
      fail(err, "Не удалось открыть чат");
    }
  };

  const action = (icon: IconName, title: string, onClick: () => void) => (
    <button type="button" className={styles.iconButton} title={title} aria-label={title} onClick={onClick}>
      <Icon name={icon} size={15} />
    </button>
  );

  return (
    <SettingsPage subtitle="Настоящие боты, которых можно программировать как угодно">
      <div className={styles.ways}>
        <p className={styles.waysTitle}>Как программировать бота</p>
        <Way icon="Globe" strong="Свой скрипт. " text="Любой язык, любой сервер — через Bot API и токен бота." />
        <Way icon="Image" strong="Мини-приложение. " text="Страница с интерфейсом внутри Shalter — ваш сервер хостит HTML, а бот открывает его по URL." />
        <a href="/bots#apps" target="_blank" rel="noreferrer" className={styles.docLink}>
          Документация Bot API →
        </a>
      </div>
      <Button className={styles.createButton} onClick={() => setShown({ kind: "create" })}>
        <Icon name="Plus" size={15} /> Создать бота
      </Button>
      <p className={styles.listTitle}>Ваши боты — {bots?.length ?? 0}</p>
      {bots && bots.length === 0 ? <p className={styles.empty}>У вас пока нет ботов</p> : null}
      <div className={styles.list}>
        {bots?.map((b) => (
          <div key={b.id} className={styles.row}>
            <Avatar name={b.user.name} color={b.user.avatarColor} image={b.user.avatarImage} size={32} />
            <div className={styles.rowBody}>
              <p className={styles.rowName}>{b.user.name}</p>
              <p className={`${styles.hint} ${styles.mono}`}>@{b.user.username}</p>
              <div className={styles.badges}>
                {b.appCode || b.appUrl ? <span className={`${styles.badge} ${styles.badgeAccent}`}>приложение</span> : null}
                {b.commands.length ? <span className={styles.badge}>{b.commands.length} команд</span> : null}
              </div>
            </div>
            {action("Send", "Открыть чат с ботом", () => void openChat(b))}
            {action("Edit", "Редактировать бота", () => setShown({ kind: "edit", bot: b }))}
            {action("Key", "Показать токен", () =>
              void botToken(b.id).then(
                ({ token }) => setShown({ kind: "token", name: b.user.name, token, fresh: false }),
                (err: unknown) => fail(err, "Не удалось получить токен")
              )
            )}
            {action("BarChart", "Команды бота", () => void editCommands(b))}
            {action("Lock", "Обновить токен", () => void regenerate(b))}
            {action("Trash", "Удалить бота", () => void remove(b))}
          </div>
        ))}
      </div>
      {shown?.kind === "create" ? (
        <CreateBotDialog
          onClose={() => setShown(null)}
          onSubmit={async (name, avatarImage, description) => {
            const { bot, token } = await createBot(name, avatarImage, description);
            client.setQueryData(botsQueries.mine().queryKey, (list) => [bot, ...(list ?? [])]);
            void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
            setShown({ kind: "token", name: bot.user.name, token, fresh: true });
          }}
        />
      ) : null}
      {shown?.kind === "token" ? <BotTokenDialog botName={shown.name} token={shown.token} fresh={shown.fresh} onClose={() => setShown(null)} /> : null}
      {shown?.kind === "edit" ? <EditBotDialog bot={shown.bot} onSaved={() => void reload()} onClose={() => setShown(null)} /> : null}
    </SettingsPage>
  );
}

function Way({ icon, strong, text }: { icon: IconName; strong: string; text: string }) {
  return (
    <div className={styles.way}>
      <span className={styles.wayIcon}>
        <Icon name={icon} size={14} />
      </span>
      <p>
        <strong>{strong}</strong>
        {text}
      </p>
    </div>
  );
}
