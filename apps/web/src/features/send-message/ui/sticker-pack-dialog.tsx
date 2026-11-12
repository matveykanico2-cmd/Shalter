import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, Icon } from "@/shared/ui";

import {
  addStickerPackToCollection,
  createStickerPack,
  deleteStickerPack,
  removeStickerPackFromCollection,
  type StickerPack,
  stickerPackQueries,
  updateStickerPack,
} from "../api/sticker-packs";
import { uniquePacks, uniqueStickers } from "../lib/sticker-outgoing";

import styles from "./drawing.module.css";
import { PackCover, StickerGridEditor } from "./sticker-pack-detail";
import pickerStyles from "./sticker-picker.module.css";

/** «Мои стикерпаки»: свои наборы и добавленные, создание, правка владельцем (стикеры, эмодзи, рисунок). */
export function StickerPackDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const packs = useQuery(stickerPackQueries.list());
  const popular = useQuery(stickerPackQueries.popular());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StickerPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });

  const list = uniquePacks(packs.data ?? []).map((p) => ({
    ...p,
    stickers: uniqueStickers(p.stickers),
  }));
  const mine = list.filter((p) => p.isOwner);
  const added = list.filter((p) => !p.isOwner);
  // «Популярные» без уже добавленных: их видно выше, в «Добавленных».
  const popularList = (popular.data ?? [])
    .filter((p) => !p.isAdded && !list.some((x) => x.id === p.id))
    .map((p) => ({ ...p, stickers: uniqueStickers(p.stickers) }));
  // Правка идёт по свежему паку из списка, а локальные изменения стикеров видны сразу.
  const editingPack = editingId
    ? draft?.id === editingId
      ? draft
      : (list.find((p) => p.id === editingId) ?? null)
    : null;

  const startNew = () => {
    setCreating(true);
    setName("");
    setDescription("");
    setError(null);
  };

  const startEdit = (p: StickerPack) => {
    setName(p.name);
    setDescription(p.description ?? "");
    setDraft(null);
    setError(null);
    setEditingId(p.id);
  };

  const stopEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveNew = async () => {
    if (!name.trim()) return setError("Назовите пак");
    setBusy(true);
    setError(null);
    try {
      await createStickerPack({
        name: name.trim(),
        description: description === "" ? null : description,
      });
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось создать пак"));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editingPack || busy) return;
    if (!name.trim()) return setError("Назовите пак");
    setBusy(true);
    setError(null);
    try {
      await updateStickerPack(editingPack.id, {
        name: name.trim(),
        description: description === "" ? null : description,
      });
      stopEdit();
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
    } finally {
      setBusy(false);
    }
  };

  const removePack = async (pack: StickerPack) => {
    if (!window.confirm(`Удалить пак «${pack.name}»?`)) return;
    setBusy(true);
    try {
      await deleteStickerPack(pack.id);
      stopEdit();
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось удалить"));
    } finally {
      setBusy(false);
    }
  };

  const toggleCollection = async (pack: StickerPack) => {
    setBusy(true);
    setError(null);
    try {
      if (pack.isAdded) await removeStickerPackFromCollection(pack.id);
      else await addStickerPackToCollection(pack.id);
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось обновить коллекцию"));
    } finally {
      setBusy(false);
    }
  };

  const title = creating
    ? "Новый пак"
    : editingPack
      ? `Правка «${editingPack.name}»`
      : "Мои стикерпаки";

  const row = (p: StickerPack) => (
    <div key={p.id} className={styles.packRow}>
      <button
        type="button"
        className={styles.packOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (p.isOwner) startEdit(p);
        }}
      >
        <PackCover pack={p} size={44} />
        <span className={styles.packMeta}>
          <span className={styles.packName}>{p.name}</span>
          <span className={styles.packCount}>
            {p.stickers.length} шт.
            {p.addedCount ? ` · добавили ${p.addedCount}` : ""}
          </span>
        </span>
      </button>
      {p.isOwner ? (
        <button
          type="button"
          className={styles.iconButton}
          title="Редактировать"
          aria-label={`Редактировать «${p.name}»`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startEdit(p);
          }}
        >
          <Icon name="Edit" size={13} />
        </button>
      ) : (
        <button
          type="button"
          className={styles.iconButton}
          title={p.isAdded ? "Убрать из коллекции" : "Добавить в коллекцию"}
          aria-label={
            p.isAdded
              ? `Убрать «${p.name}» из коллекции`
              : `Добавить «${p.name}» в коллекцию`
          }
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void toggleCollection(p);
          }}
        >
          <Icon name={p.isAdded ? "Check" : "Plus"} size={13} />
        </button>
      )}
      {p.isOwner ? (
        <button
          type="button"
          className={styles.iconButton}
          title="Удалить"
          aria-label={`Удалить «${p.name}»`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void removePack(p);
          }}
        >
          <Icon name="Trash" size={15} />
        </button>
      ) : null}
    </div>
  );

  return (
    <Dialog title={title} onClose={onClose} className={styles.packDialog}>
      {packs.isError ? (
        <p className={styles.error} role="alert">
          {errorText(packs.error, "Не удалось загрузить паки")}
        </p>
      ) : creating ? (
        <>
          <input
            className={styles.input}
            placeholder="Название пака"
            aria-label="Название пака"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <textarea
            className={styles.detailDesc}
            placeholder="Описание пака (необязательно)"
            aria-label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.detailActions}>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Отмена
            </Button>
            <Button disabled={busy} onClick={saveNew}>
              {busy ? "Создаём…" : "Создать пак"}
            </Button>
          </div>
        </>
      ) : editingPack ? (
        <>
          <div className={pickerStyles.packHero}>
            <PackCover pack={editingPack} size={56} />
            <div className={pickerStyles.heroText}>
              <input
                className={styles.input}
                placeholder="Название пака"
                aria-label="Название пака"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>
          </div>
          <textarea
            className={styles.detailDesc}
            placeholder="Описание пака (необязательно)"
            aria-label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <StickerGridEditor
            pack={editingPack}
            onChange={(next, saved) => {
              setDraft(next);
              if (saved) void refresh();
            }}
          />
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.detailActions}>
            <Button
              variant="danger"
              onClick={() => void removePack(editingPack)}
            >
              Удалить пак
            </Button>
            <Button variant="secondary" onClick={stopEdit}>
              Отмена
            </Button>
            <Button disabled={busy} onClick={saveEdit}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </>
      ) : (
        <>
          {list.length ? (
            <div className={styles.packList}>
              {mine.length ? (
                <h3 className={pickerStyles.heading}>Мои наборы</h3>
              ) : null}
              {mine.map(row)}
              {added.length ? (
                <h3 className={pickerStyles.heading}>Добавленные</h3>
              ) : null}
              {added.map(row)}
            </div>
          ) : packs.data ? (
            <p className={styles.packEmpty}>У вас пока нет стикерпаков</p>
          ) : null}
          {popularList.length ? (
            <div className={styles.packList}>
              <h3 className={pickerStyles.heading}>Популярные</h3>
              {popularList.map((p) => (
                <div key={p.id} className={styles.packRow}>
                  <span className={styles.packOpen}>
                    <PackCover pack={p} size={44} />
                    <span className={styles.packMeta}>
                      <span className={styles.packName}>{p.name}</span>
                      <span className={styles.packCount}>
                        {p.stickers.length} шт.
                        {p.addedCount ? ` · добавили ${p.addedCount}` : ""}
                      </span>
                    </span>
                  </span>
                  <Button
                    disabled={busy}
                    aria-label={`Добавить «${p.name}»`}
                    onClick={() => void toggleCollection(p)}
                  >
                    Добавить
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.detailActions}>
            <Button onClick={startNew}>Создать пак</Button>
          </div>
        </>
      )}
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
