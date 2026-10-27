import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { GameMetaDialog, useGameToken } from "@/features/games";

import { gameApi, gameQueries, openGame, openGamesCatalog, type OwnGame } from "@/entities/game";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Button, EmojiText, Icon, type IconName, SettingsPage, toast } from "@/shared/ui";

import { deleteGame } from "../../api/games-api";

import styles from "./games-section.module.css";

/** «Настройки → Игры» (renderGames): свои HTML5-игры — создать, играть, токен Game API, каталог. */
export function GamesSection() {
  const client = useQueryClient();
  const games = (useQuery(gameQueries.mine()).data ?? []) as OwnGame[];
  const [editing, setEditing] = useState<OwnGame | "new" | null>(null);
  const token = useGameToken();
  const reload = () => client.invalidateQueries({ queryKey: gameQueries.baseKey });

  const togglePublish = async (g: OwnGame) => {
    try {
      await gameApi.updateMeta(g.id, { title: g.title, emoji: g.emoji, description: g.description ?? "", isPublic: !g.isPublic });
      await reload();
    } catch (err) {
      toast(errorText(err, "Не удалось изменить публичность"), { error: true });
    }
  };

  const remove = async (g: OwnGame) => {
    if (!(await askConfirm(`Удалить игру «${g.title}» безвозвратно?`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await deleteGame(g.id);
      await reload();
    } catch (err) {
      toast(errorText(err, "Не удалось удалить игру"), { error: true });
    }
  };

  const action = (title: string, onClick: () => void, icon: IconName | null, text?: string) => (
    <button type="button" className={styles.iconButton} title={title} aria-label={title} onClick={onClick}>
      {icon ? <Icon name={icon} size={15} /> : <EmojiText text={text ?? ""} />}
    </button>
  );

  return (
    <SettingsPage subtitle="Свои HTML5-игры: в чатах, с рекордами и API">
      <div className={styles.ways}>
        <p className={styles.waysTitle}>Как это работает</p>
        <Way icon="Globe" strong="Свой сервер. " text="Игра — HTML-страница: пишете на своём хостинге, а код и рекорды подаёте через Game API по токену." />
        <Way icon="BarChart" strong="Рекорды и SDK. " text="Shalter.score(), таблица рекордов, «поделиться в чат» — уже встроены." />
        <Way icon="Key" strong="Game API. " text="Токен игры — обновлять код из своего репозитория и ставить рекорды со своего сервера." />
        <a href="/games" target="_blank" rel="noreferrer" className={styles.docLink}>
          Документация SDK и Game API →
        </a>
      </div>
      <Button className={styles.createButton} onClick={() => setEditing("new")}>
        <Icon name="Plus" size={15} /> Создать игру
      </Button>
      <p className={styles.listTitle}>Ваши игры — {games.length}</p>
      {games.length === 0 ? (
        <p className={styles.empty}>У вас пока нет своих игр</p>
      ) : (
        <div className={styles.list}>
          {games.map((g) => (
            <div key={g.id} className={styles.row}>
              <span className={styles.emoji}>
                <EmojiText text={g.emoji || "🎮"} />
              </span>
              <div className={styles.rowBody}>
                <p className={styles.rowName}>{g.title}</p>
                <p className={styles.hint}>
                  {[g.hasCode === false ? "черновик — загрузите код через Game API" : g.isPublic ? "в каталоге" : "только по ссылке", g.plays ? ` · ${g.plays} запусков` : ""].join("")}
                </p>
              </div>
              {action("Играть", () => openGame(g), "PlayFill")}
              {action("API-токен", () => void token.show(g), "Key")}
              {action("Редактировать", () => setEditing(g), "Edit")}
              {action(g.isPublic ? "Скрыть из каталога" : "Показать в каталоге", () => void togglePublish(g), null, g.isPublic ? "🚫" : "👁")}
              {action("Удалить", () => void remove(g), "Trash")}
            </div>
          ))}
        </div>
      )}
      <Button variant="secondary" className={styles.catalog} onClick={() => openGamesCatalog()}>
        Открыть каталог игр
      </Button>
      {editing ? <GameMetaDialog game={editing === "new" ? null : editing} onSaved={() => void reload()} onClose={() => setEditing(null)} /> : null}
      {token.dialog}
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
