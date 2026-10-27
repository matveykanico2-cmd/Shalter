import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useRef, useState } from "react";

import { uploadFile } from "@/shared/api";
import { renderSticker, SCENES, sceneSummaryEmoji, type Sticker } from "@/shared/lib/anim";
import { errorText } from "@/shared/lib/error-text";
import { AnimatorDialog, Button, Dialog, DomNode, Icon } from "@/shared/ui";

import { createStickerPack, deleteStickerPack, type StickerPack, stickerPackQueries, updateStickerPack } from "../api/sticker-packs";
import { prepareStickerImage } from "../lib/sticker-image";

import styles from "./drawing.module.css";
import { PaintDialog } from "./paint-dialog";

const SCENE_CHOICES = [{ id: "", label: "Авто" }, ...Object.keys(SCENES).map((id) => ({ id, label: id.replace(/_/g, " ") }))];

/** Картинка в пак: подготовить (512 px или GIF как есть) и загрузить. */
async function uploadStickerImage(file: File): Promise<Sticker> {
  const { file: prepared, animated } = await prepareStickerImage(file);
  const { url } = await uploadFile(prepared, "image");
  return { kind: "image", url, name: "", ...(animated ? { animated: true } : {}) } as Sticker;
}

type Editing = { id: string | null };
/** Аниматор: новый стикер или правка i-го. */
type Animating = { index: number | null };

/**
 * «Стикерпаки» — public/js/components/stickerPackDialog.js: список своих паков, создание и
 * правка (картинки, рисунок, своя анимация, эмодзи со сценой), удаление.
 */
export function StickerPackDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const packs = useQuery(stickerPackQueries.list());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState("");
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [emoji, setEmoji] = useState("");
  const [label, setLabel] = useState("");
  const [scene, setScene] = useState("");
  const [animating, setAnimating] = useState<Animating | null>(null);
  const [painting, setPainting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  const refresh = () => client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });

  const startNew = () => {
    setEditing({ id: null });
    setName("");
    setStickers([]);
    setError(null);
  };
  const startEdit = (pack: StickerPack) => {
    setEditing({ id: pack.id });
    setName(pack.name);
    setStickers(pack.stickers.map((s) => ({ ...s })));
    setError(null);
  };

  const save = async () => {
    if (busy || !editing) return;
    if (!name.trim()) return setError("Назовите пак");
    if (!stickers.length) return setError("Добавьте хотя бы один стикер");
    setBusy(true);
    setError(null);
    try {
      if (editing.id) await updateStickerPack(editing.id, { name, stickers });
      else await createStickerPack({ name, stickers });
      await refresh();
      setEditing(null);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
    } finally {
      setBusy(false);
    }
  };

  const removePack = async (pack: StickerPack) => {
    try {
      await deleteStickerPack(pack.id);
      await refresh();
    } catch (err) {
      setError(errorText(err, "Не удалось удалить"));
    }
  };

  const addImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setUploading((n) => n + files.length);
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          return { sticker: await uploadStickerImage(file) };
        } catch (err) {
          return { error: errorText(err, "Не удалось добавить картинку") };
        } finally {
          setUploading((n) => n - 1);
        }
      })
    );
    const added = results.flatMap((r) => (r.sticker ? [r.sticker] : []));
    setStickers((list) => [...list, ...added]);
    const failures = results.flatMap((r) => (r.error ? [r.error] : []));
    if (failures.length) setError(failures.length === files.length ? failures[0]! : `Добавлено ${files.length - failures.length} из ${files.length}: ${failures[0]}`);
  };

  const addPainting = async (file: File) => {
    setError(null);
    setUploading((n) => n + 1);
    try {
      const sticker = await uploadStickerImage(file);
      setStickers((list) => [...list, sticker]);
    } catch (err) {
      setError(errorText(err, "Не удалось добавить рисунок"));
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const addEmoji = () => {
    const value = emoji.trim();
    if (!value) return;
    setStickers((list) => [...list, { emoji: value, name: label.trim(), ...(scene ? { scene } : {}) }]);
    setEmoji("");
    setLabel("");
  };

  const title = editing ? (editing.id ? "Изменить пак" : "Новый пак") : "Стикерпаки";
  return (
    <>
      {/* Поверх — аниматор или рисовалка: окно пака прячем, чтобы Escape закрывал только их. */}
      {animating || painting ? null : (
      <Dialog title={title} onClose={onClose} className={styles.packDialog}>
        <div className={styles.packBody}>
          {editing ? (
            <>
              <input className={styles.input} placeholder="Название пака" aria-label="Название пака" value={name} onChange={(e) => setName(e.target.value)} />
              <p className={styles.fieldLabel}>Стикеры ({stickers.length})</p>
              {stickers.length ? (
                <div className={styles.packGrid}>
                  {stickers.map((s, i) => (
                    <div key={`${s.url ?? s.emoji ?? ""}:${i}`} className={styles.packCell}>
                      <DomNode create={() => renderSticker(s, { size: 40 })} />
                      {s.kind === "custom" ? (
                        <button type="button" className={styles.cellEdit} title="Изменить" aria-label="Изменить" onClick={() => setAnimating({ index: i })}>
                          <Icon name="Edit" size={12} />
                        </button>
                      ) : null}
                      <button type="button" className={styles.cellRemove} title="Убрать" aria-label="Убрать" onClick={() => setStickers((list) => list.filter((_, j) => j !== i))}>
                        <Icon name="X" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>Пока пусто — добавьте картинки или эмодзи ниже</p>
              )}
              <button type="button" className={styles.addButton} disabled={uploading > 0} onClick={() => imageInput.current?.click()}>
                {uploading > 0 ? `Загружаем… (${uploading})` : "Добавить фото, PNG без фона или GIF"}
              </button>
              <input ref={imageInput} type="file" accept="image/*" multiple hidden data-testid="sticker-pack-images" onChange={(e) => void addImages(e)} />
              <button type="button" className={styles.addButton} onClick={() => setAnimating({ index: null })}>
                ✏️ Нарисовать свою анимацию
              </button>
              <button type="button" className={styles.addButton} disabled={uploading > 0} onClick={() => setPainting(true)}>
                🖌️ Нарисовать картинку
              </button>
              <p className={styles.fieldLabel}>Или эмодзи с анимацией</p>
              <div className={styles.addRow}>
                <input className={`${styles.input} ${styles.emojiInput}`} placeholder="😀" aria-label="Эмодзи" maxLength={8} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
                <input className={styles.input} placeholder="Подпись (необязательно)" aria-label="Подпись" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className={styles.addRow}>
                <select className={styles.input} aria-label="Анимация" value={scene} onChange={(e) => setScene(e.target.value)}>
                  {SCENE_CHOICES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Button className={styles.pill} onClick={addEmoji}>
                  Добавить
                </Button>
              </div>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              <Button disabled={busy || uploading > 0} onClick={() => void save()}>
                {busy ? "Сохраняем…" : editing.id ? "Сохранить" : "Создать пак"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
              >
                Назад
              </Button>
            </>
          ) : (
            <>
              {packs.data?.length ? (
                <div className={styles.packList}>
                  {packs.data.map((p) => (
                    <div key={p.id} className={styles.packRow}>
                      <button type="button" className={styles.packOpen} onClick={() => startEdit(p)}>
                        <span className={styles.packPreview}>
                          {p.stickers.slice(0, 4).map((s, i) => (
                            <DomNode key={i} create={() => renderSticker(s, { size: 22 })} />
                          ))}
                        </span>
                        <span className={styles.packMeta}>
                          <span className={styles.packName}>{p.name}</span>
                          <span className={styles.packCount}>{p.stickers.length} шт.</span>
                        </span>
                      </button>
                      <button type="button" className={styles.iconButton} title="Удалить" aria-label={`Удалить «${p.name}»`} onClick={() => void removePack(p)}>
                        <Icon name="Trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : packs.isError ? null : packs.data ? (
                <p className={styles.empty}>У вас пока нет своих паков</p>
              ) : null}
              {error || packs.isError ? (
                <p className={styles.error} role="alert">
                  {error ?? errorText(packs.error, "Не удалось загрузить паки")}
                </p>
              ) : null}
              <Button onClick={startNew}>Создать пак</Button>
            </>
          )}
        </div>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      </Dialog>
      )}
      {animating ? (
        <AnimatorDialog
          title={animating.index === null ? "Нарисовать стикер" : "Изменить стикер"}
          saveLabel={animating.index === null ? "Добавить в пак" : "Сохранить"}
          initial={animating.index === null ? null : stickers[animating.index]?.scene}
          onSave={(result) => {
            const index = animating.index;
            if (index === null) {
              setStickers((list) => [...list, { kind: "custom", scene: result, emoji: sceneSummaryEmoji(result), name: "" }]);
              setError(null);
            } else {
              setStickers((list) => list.map((s, j) => (j === index ? { ...s, scene: result, emoji: sceneSummaryEmoji(result) } : s)));
            }
          }}
          onClose={() => setAnimating(null)}
        />
      ) : null}
      {painting ? <PaintDialog title="Нарисовать стикер" onDone={(file) => void addPainting(file)} onClose={() => setPainting(false)} /> : null}
    </>
  );
}
