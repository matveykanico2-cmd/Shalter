import { useState } from "react";

import { gameApi, type OwnGame } from "@/entities/game";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog } from "@/shared/ui";

import styles from "./games.module.css";

type Props = {
  /** null — новая игра. */
  game: OwnGame | null;
  onSaved?: (game: OwnGame) => void;
  onClose: () => void;
};

/**
 * Игра — только метаданные (openGameMetaDialog в games.js): код хранится и отдаётся сервером
 * разработчика через Game API, внутри Shalter игра открывается в iframe.
 */
export function GameMetaDialog({ game, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(game?.title ?? "");
  const [emoji, setEmoji] = useState(game?.emoji ?? "🎮");
  const [description, setDescription] = useState(game?.description ?? "");
  const [isPublic, setPublic] = useState(!!game?.isPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { title: title.trim(), emoji: emoji.trim(), description: description.trim(), isPublic };
      const res = game ? await gameApi.updateMeta(game.id, payload) : await gameApi.create({ ...payload, code: "" });
      onSaved?.(res.game);
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
      setBusy(false);
    }
  };

  return (
    <Dialog title={game ? "Игра" : "Новая игра"} onClose={onClose}>
      <p className={styles.hint}>Код игры загружайте на своём сервере через Game API — он не редактируется в этом диалоге.</p>
      <p className={styles.label}>Название</p>
      <input className={styles.input} placeholder="Название" maxLength={64} value={title} onChange={(e) => setTitle(e.target.value)} />
      <p className={styles.label}>Эмодзи</p>
      <input className={styles.input} placeholder="🎮" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
      <p className={styles.label}>Описание</p>
      <input className={styles.input} placeholder="Короткое описание (необязательно)" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className={styles.public}>
        <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
        <span>Показывать в каталоге игр для всех</span>
      </label>
      {error ? <p className={styles.errorText}>{error}</p> : null}
      <Button disabled={busy} onClick={() => void save()}>
        {busy ? "Сохраняем…" : "Сохранить"}
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
