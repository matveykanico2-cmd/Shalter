import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { uploadFile } from "@/shared/api";
import type { Sticker as AnimSticker } from "@/shared/lib/anim";
import { renderSticker } from "@/shared/lib/anim";
import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, DomNode, Icon } from "@/shared/ui";

import { addSticker, addStickerPackToCollection, createStickerPack, deleteStickerPack, removeStickerPackFromCollection, type StickerPack, stickerPackQueries, updateStickerPack } from "../api/sticker-packs";

import styles from "./drawing.module.css";
import { StickerPackDetail } from "./sticker-pack-detail";

/** «Мои стикерпаки»: список, создание, редактирование владельцем, добавление/удаление из коллекции. */
export function StickerPackDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const packs = useQuery(stickerPackQueries.list());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingPack, setEditingPack] = useState<StickerPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);

  const refresh = () => client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });

  const startNew = () => {
    setCreating(true);
    setName("");
    setDescription("");
    setError(null);
  };

  const saveNew = async () => {
    if (!name.trim()) return setError("Назовите пак");
    setBusy(true);
    setError(null);
    try {
      await createStickerPack({ name: name.trim(), description: description === "" ? null : description });
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
      await updateStickerPack(editingPack.id, { name: name.trim(), description: description === "" ? null : description });
      setEditingPack(null);
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

  const addStickerImage = async (file: File) => {
    if (!editingPack || busy) return;
    setUploading((n) => n + 1);
    setError(null);
    try {
      const { url } = await uploadFile(file, "image");
      await addSticker(editingPack.id, { file: url, emoji: "✨" });
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось добавить стикер"));
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const list = packs.data ?? [];
  const title = creating ? "Новый пак" : editingPack ? `Правка «${editingPack.name}»` : "Мои стикерпаки";

  return (
    <Dialog title={title} onClose={onClose} className={styles.packDialog}>
      {packs.isError ? (
        <p className={styles.error} role="alert">{errorText(packs.error, "Не удалось загрузить паки")}</p>
      ) : creating ? (
        <>
          <input className={styles.input} placeholder="Название пака" aria-label="Название пака" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <textarea className={styles.detailDesc} placeholder="Описание пака (необязательно)" aria-label="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.detailActions}>
            <Button variant="secondary" onClick={() => setCreating(false)}>Отмена</Button>
            <Button disabled={busy} onClick={saveNew}>{busy ? "Создаём…" : "Создать пак"}</Button>
          </div>
        </>
      ) : editingPack ? (
        <>
          <input className={styles.input} placeholder="Название пака" aria-label="Название пака" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <textarea className={styles.detailDesc} placeholder="Описание пака (необязательно)" aria-label="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
          <p className={styles.detailHint}>Стикеров: {editingPack.stickerCount}. Добавьте картинку (PNG/WebP) с эмодзи.</p>
          <button type="button" className={styles.addButton} disabled={uploading > 0} onClick={() => imageInput.current?.click()}>
            {uploading > 0 ? `Загружаем… (${uploading})` : "Добавить стикер (PNG/WebP)"}
          </button>
          <input ref={imageInput} type="file" accept="image/*" multiple hidden data-testid="sticker-pack-images" onChange={(e) => [...(e.target.files ?? [])].forEach((f) => void addStickerImage(f))} />
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.detailActions}>
            <Button variant="secondary" onClick={() => setEditingPack(null)}>Отмена</Button>
            <Button disabled={busy} onClick={saveEdit}>{busy ? "Сохраняем…" : "Сохранить"}</Button>
          </div>
          <Button variant="danger" onClick={() => void removePack(editingPack!)} style={{ marginLeft: "auto" }}>
            Удалить пак
          </Button>
        </>
      ) : (
        <>
          {list.length ? (
            <div className={styles.packList}>
              {list.map((p: StickerPack) => (
                <div key={p.id} className={styles.packRow}>
                  <button
                    type="button"
                    className={styles.packOpen}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingPack(p);
                    }}
                  >
                    <span className={styles.packPreview}>
                      {p.stickers.slice(0, 4).map((s, i) => (
                        <DomNode key={i} create={() => renderSticker({ ...s, kind: "image" } as AnimSticker, { size: 22 })} />
                      ))}
                    </span>
                    <span className={styles.packMeta}>
                      <span className={styles.packName}>{p.name}</span>
                      <span className={styles.packCount}>{p.stickerCount} шт.</span>
                    </span>
                  </button>
                  {p.isOwner ? (
                    <button type="button" className={styles.iconButton} title="Редактировать" aria-label={`Редактировать «${p.name}»`} onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setName(p.name);
                      setDescription(p.description ?? "");
                      setEditingPack(p);
                    }}>
                      <Icon name="Edit" size={13} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={p.isAdded ? "Убрать из коллекции" : "Добавить в коллекцию"}
                    aria-label={p.isAdded ? `Убрать «${p.name}» из коллекции` : `Добавить «${p.name}» в коллекцию`}
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void toggleCollection(p);
                    }}
                  >
                    <Icon name={p.isAdded ? "Check" : "Plus"} size={13} />
                  </button>
                  {p.isOwner ? (
                    <button type="button" className={styles.iconButton} title="Удалить" aria-label={`Удалить «${p.name}»`} onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void removePack(p);
                    }}>
                      <Icon name="Trash" size={15} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : packs.data ? (
            <p className={styles.packEmpty}>У вас пока нет стикерпаков</p>
          ) : null}
          {error || packs.isError ? (
            <p className={styles.error} role="alert">{error ?? errorText(packs.error, "Не удалось загрузить паки")}</p>
          ) : null}
          <div className={styles.detailActions}>
            <Button onClick={startNew}>Создать пак</Button>
          </div>
        </>
      )}
      {editingPack ? (
        <StickerPackDetail pack={editingPack} onClose={() => setEditingPack(null)} onStickerPick={() => {}} onRefresh={refresh} />
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
