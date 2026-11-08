import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const botsQuery = useQuery(botsQueries.mine());
  const bots = botsQuery.data;
  const [shown, setShown] = useState<Shown>(null);
  const intent = useRef(0);
  useEffect(() => () => { intent.current++; }, []);
  const show = (next: Shown) => {
    intent.current++;
    setShown(next);
  };
  const showToken = async (b: Bot) => {
    const request = ++intent.current;
    try {
      const { token } = await botToken(b.id);
      if (request === intent.current) setShown({ kind: "token", name: b.user.name, token, fresh: false });
    } catch (err) {
      if (request === intent.current) fail(err, "Не удалось получить токен");
    }
  };
  const reload = () => client.invalidateQueries({ queryKey: botsQueries.mine().queryKey });
  const fail = (err: unknown, fallback: string) => toast(errorText(err, fallback), { error: true });

  const regenerate = async (b: Bot) => {
    const request = ++intent.current;
    if (!(await askConfirm(`Обновить токен бота «${b.user.name}»? Старый токен перестанет работать.`, { okLabel: "Обновить", danger: true }))) return;
    if (request !== intent.current) return;
    try {
      const { token } = await regenerateBotToken(b.id);
      if (request === intent.current) setShown({ kind: "token", name: b.user.name, token, fresh: true });
    } catch (err) {
      if (request === intent.current) fail(err, "Не удалось обновить токен");
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
    const request = ++intent.current;
    try {
      const { chat } = await openDm(b.userId, b.user.name, b.user.avatarColor);
      if (request === intent.current) void navigate(`/chat/${chat.id}`);
    } catch (err) {
      if (request === intent.current) fail(err, "Не удалось открыть чат");
    }
  };

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
      <Button className={styles.createButton} onClick={() => show({ kind: "create" })}>
        <Icon name="Plus" size={15} /> Создать бота
      </Button>
      <p className={styles.listTitle}>{bots ? `Ваши боты — ${bots.length}` : "Ваши боты"}</p>
      {botsQuery.isPending ? <p className={styles.hint} role="status">Загружаем ботов…</p> : null}
      {botsQuery.isError ? <div role="alert">
        <p className={styles.error}>{errorText(botsQuery.error, "Не удалось загрузить ботов")}</p>
        <Button variant="secondary" onClick={() => void botsQuery.refetch()}>Повторить</Button>
      </div> : null}
      {bots && bots.length === 0 ? <p className={styles.empty}>У вас пока нет ботов</p> : null}
      <div className={styles.list}>
        {bots?.map((b) => (
          <div key={b.id} className={styles.row}>
            <Avatar name={b.user.name} color={b.user.avatarColor} image={b.user.avatarImage} emoji={b.user.avatarEmoji} size={32} />
            <div className={styles.rowBody}>
              <p className={styles.rowName}>{b.user.name}</p>
              <p className={`${styles.hint} ${styles.mono}`}>@{b.user.username}</p>
              <div className={styles.badges}>
                {b.appCode || b.appUrl ? <span className={`${styles.badge} ${styles.badgeAccent}`}>приложение</span> : null}
                {b.commands.length ? <span className={styles.badge}>{b.commands.length} команд</span> : null}
              </div>
            </div>
            <BotAction icon="Send" title="Открыть чат с ботом" onClick={() => void openChat(b)} />
            <BotAction icon="Edit" title="Редактировать бота" onClick={() => show({ kind: "edit", bot: b })} />
            <BotAction icon="Key" title="Показать токен" onClick={() => void showToken(b)} />
            <BotAction icon="BarChart" title="Команды бота" onClick={() => void editCommands(b)} />
            <BotAction icon="Lock" title="Обновить токен" onClick={() => void regenerate(b)} />
            <BotAction icon="Trash" title="Удалить бота" onClick={() => void remove(b)} />
          </div>
        ))}
      </div>
      {shown?.kind === "create" ? (
        <CreateBotDialog
          onClose={() => show(null)}
          onSubmit={async (name, avatarImage, description) => {
            const request = ++intent.current;
            const result = await createBot(name, avatarImage, description).catch((err: unknown) => {
              if (request === intent.current) throw err;
              return null;
            });
            if (!result) return;
            const { bot, token } = result;
            await client.cancelQueries({ queryKey: botsQueries.mine().queryKey });
            client.setQueryData(botsQueries.mine().queryKey, (list) => [bot, ...(list ?? []).filter((existing) => existing.id !== bot.id)]);
            void reload();
            void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
            if (request === intent.current) setShown({ kind: "token", name: bot.user.name, token, fresh: true });
          }}
        />
      ) : null}
      {shown?.kind === "token" ? <BotTokenDialog botName={shown.name} token={shown.token} fresh={shown.fresh} onClose={() => show(null)} /> : null}
      {shown?.kind === "edit" ? <EditBotDialog bot={shown.bot} onSaved={() => void reload()} onClose={() => show(null)} /> : null}
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

function BotAction({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.iconButton} title={title} aria-label={title} onClick={onClick}>
      <Icon name={icon} size={15} />
    </button>
  );
}
