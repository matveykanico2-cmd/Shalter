import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { closeGamesCatalog, type GameListItem, gameQueries, openGame } from "@/entities/game";

import { errorText } from "@/shared/lib/error-text";
import { Button, Icon } from "@/shared/ui";

import styles from "./games.module.css";

type Props = { chatId: string | null; onPick: ((game: GameListItem) => void) | null };

/** Каталог игр (openGamesCatalog в games.js): встроенные, игры сообщества и свои; onPick — «В чат». */
export function GamesCatalog({ chatId, onPick }: Props) {
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  // Поиск — через 250 мс после последней буквы.
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGamesCatalog();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const all = useQuery({ ...gameQueries.list(query), enabled: tab === "all" });
  const mine = useQuery({ ...gameQueries.mine(), enabled: tab === "mine" });
  const source = tab === "mine" ? mine : all;
  const q = query.toLowerCase();
  const games = tab === "mine" && q ? source.data?.filter((g) => `${g.title} ${g.description ?? ""}`.toLowerCase().includes(q)) : source.data;

  let body;
  if (source.isError) body = <p className={`${styles.empty} ${styles.errorText}`}>{errorText(source.error, "Не удалось загрузить игры")}</p>;
  else if (!games) body = <p className={styles.empty}>Загружаем…</p>;
  else if (!games.length)
    body = (
      <p className={styles.empty}>
        {query ? "Ничего не найдено" : tab === "mine" ? "У вас пока нет своих игр — создавайте их на своём сервере и отправляйте карточки через Game API (см. /games)" : "Игр пока нет"}
      </p>
    );
  else
    body = games.map((g) => (
      <div key={g.id} className={styles.tile}>
        <span className={styles.tileEmoji}>{g.emoji || "🎮"}</span>
        <span className={styles.tileTitle}>{g.title}</span>
        <span className={styles.tileDesc}>{g.description || ("builtin" in g ? "Встроенная игра" : g.isPublic ? "Игра сообщества" : "Только по ссылке")}</span>
        <div className={styles.tileActions}>
          <Button onClick={() => openGame(g, { chatId })}>Играть</Button>
          {onPick ? (
            <Button
              variant="secondary"
              onClick={() => {
                closeGamesCatalog();
                onPick(g);
              }}
            >
              В чат
            </Button>
          ) : null}
        </div>
      </div>
    ));

  return createPortal(
    <div
      className={styles.modalOverlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeGamesCatalog();
      }}
    >
      <div className={`${styles.modal} ${styles.catalog}`} role="dialog" aria-modal="true" aria-label="Игры">
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>🎮 Игры</h2>
          <button type="button" className={styles.iconButton} title="Закрыть" aria-label="Закрыть" onClick={closeGamesCatalog}>
            <Icon name="X" size={20} />
          </button>
        </div>
        <input className={styles.search} placeholder="Поиск игр" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className={styles.tabs}>
          {(
            [
              ["all", "Все игры"],
              ["mine", "Мои игры"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.grid}>{body}</div>
      </div>
    </div>,
    document.body
  );
}
