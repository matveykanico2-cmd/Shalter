import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { closeGame, gameApi, type GameFull, gameQueries, type GameRef, openGameScores } from "@/entities/game";
import { useSession } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Icon, toast } from "@/shared/ui";

import { shareGameScore } from "../api/share-score";
import { buildGameDoc, writeGameStore } from "../lib/game-doc";

import styles from "./games.module.css";

type GameMessage = { __shalterGame?: 1; type?: string; score?: unknown; data?: unknown; message?: unknown; id?: number; method?: string; args?: Record<string, unknown> };

/** Игровое окно поверх всего (openGame в public/js/components/games.js). chatId — откуда запустили. */
export function GamePlayer({ game: ref, chatId }: { game: GameRef; chatId: string | null }) {
  const me = useSession().data?.user;
  const client = useQueryClient();
  const frame = useRef<HTMLIFrameElement>(null);
  const [game, setGame] = useState<GameRef | GameFull | null>(ref.code ? ref : null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeGame();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // Код игры — с сервера (у карточки и каталога его нет).
  useEffect(() => {
    if (ref.code) return;
    let alive = true;
    gameApi.get(ref.id).then(
      (r) => alive && setGame(r.game),
      (err: unknown) => alive && setError(errorText(err, "Игра не загрузилась"))
    );
    return () => {
      alive = false;
    };
  }, [ref.id, ref.code]);

  const code = game?.code ?? "";
  const title = game?.title ?? ref.title ?? "Игра";
  const gameId = game?.id ?? ref.id;

  // Документ строится один раз на игру: перерисовки окна не перезапускают её.
  const meId = me?.id ?? null;
  const meName = me?.name ?? "Игрок";
  const doc = useMemo(() => {
    if (!code) return null;
    const root = document.documentElement;
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || root.dataset.theme === "dark";
    const accent = getComputedStyle(root).getPropertyValue("--color-accent").trim() || "#3390ec";
    return buildGameDoc(code, gameId, { id: meId, name: meName }, { theme: { dark, accent }, chat: chatId ? { id: chatId } : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- игрок и тема берутся на момент запуска
  }, [code, gameId, chatId]);
  useEffect(() => {
    if (doc) gameApi.play(gameId).catch(() => {});
  }, [doc, gameId]);

  // Сообщения из игры: счёт, хранилище, закрытие и методы SDK.
  const best = useRef(0);
  useEffect(() => {
    if (!doc) return;
    let sendTimer: ReturnType<typeof setTimeout> | undefined;
    const reply = (id: number | undefined, result: unknown, err?: string) => frame.current?.contentWindow?.postMessage({ __shalterGameReply: 1, id, result, error: err }, "*");
    const handleRpc = async (m: GameMessage) => {
      try {
        const args = m.args ?? {};
        if (m.method === "best") return reply(m.id, (await gameApi.best(gameId, chatId)).best ?? 0);
        if (m.method === "leaderboard") {
          const scores = await client.fetchQuery(gameQueries.scores(gameId, args.chat === false ? null : chatId));
          return reply(
            m.id,
            scores.slice(0, Math.min(100, Number(args.limit) || 20)).map((s, i) => ({ position: i + 1, name: s.name, score: s.score, isMe: s.userId === me?.id }))
          );
        }
        if (m.method === "vibrate") {
          navigator.vibrate?.(Number(args.ms) || 30);
          return reply(m.id, true);
        }
        if (m.method === "share") {
          if (!chatId) return reply(m.id, null, "Игра открыта не из чата — делиться некуда");
          const s = Math.max(0, Math.floor(Number(args.score) || 0));
          const text = typeof args.text === "string" && args.text ? args.text : `🎮 ${title}: мой результат — ${s}! Сможешь больше?`;
          await shareGameScore(chatId, { id: gameId, title, emoji: game?.emoji, description: game?.description }, text);
          toast("Результат отправлен в чат");
          return reply(m.id, true);
        }
        reply(m.id, null, `Неизвестный метод ${m.method}`);
      } catch (err) {
        reply(m.id, null, errorText(err, "Ошибка"));
      }
    };
    const onMessage = (e: MessageEvent<GameMessage>) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__shalterGame) return;
      const m = e.data;
      if (m.type === "rpc") return void handleRpc(m);
      if (m.type === "store") writeGameStore(gameId, m.data ?? {});
      else if (m.type === "close") closeGame();
      else if (m.type === "score" || m.type === "over") {
        const value = Math.max(0, Math.floor(Number(m.score) || 0));
        setScore(value);
        if (value <= best.current) return;
        best.current = value;
        // Счёт приходит часто — шлём лучший не чаще раза в 2 с и сразу в конце игры.
        clearTimeout(sendTimer);
        const over = m.type === "over";
        const send = () =>
          gameApi
            .submitScore(gameId, best.current, chatId)
            .then((r) => {
              if (r.improved && over) toast(`Новый рекорд: ${r.best}!`);
              void client.invalidateQueries({ queryKey: [...gameQueries.baseKey, "scores", gameId] });
            })
            .catch(() => {});
        if (over) send();
        else sendTimer = setTimeout(send, 2000);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(sendTimer);
    };
  }, [doc, gameId, chatId, client, me?.id, title, game?.emoji, game?.description]);

  useEffect(() => {
    if (doc) frame.current?.focus();
  }, [doc]);

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.head}>
        <button type="button" className={styles.iconButton} title="Закрыть" aria-label="Закрыть" onClick={closeGame}>
          <Icon name="X" size={22} />
        </button>
        <span className={styles.emoji}>{game?.emoji ?? ref.emoji ?? "🎮"}</span>
        <span className={styles.title}>{title}</span>
        {score !== null ? <span className={styles.score}>{score}</span> : null}
        <button type="button" className={styles.iconButton} title="Рекорды" aria-label="Рекорды" onClick={() => openGameScores({ id: gameId, title, emoji: game?.emoji ?? ref.emoji }, chatId)}>
          <Icon name="BarChart" size={20} />
        </button>
      </div>
      <div className={styles.frameSlot}>
        {error ? (
          <p className={styles.error}>{error}</p>
        ) : game && !code ? (
          <p className={styles.error}>Игра ещё не загружена — отправьте код на своём сервере через Game API</p>
        ) : doc ? (
          <iframe ref={frame} className={styles.frame} sandbox="allow-scripts allow-pointer-lock" allow="fullscreen; gamepad; autoplay" title={title} srcDoc={doc} />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
