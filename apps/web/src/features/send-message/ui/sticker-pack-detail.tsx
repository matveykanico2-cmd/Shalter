import { useState } from "react";

import { renderSticker, type Sticker as AnimSticker } from "@/shared/lib/anim";
import type { Sticker } from "@shalter/shared/schemas/stickers";
import { DomNode, Button, Icon } from "@/shared/ui";

import { addSticker, deleteStickerPack, removeSticker, type StickerPack, updateStickerPack } from "../api/sticker-packs";

import styles from "./sticker-picker.module.css";

type PackView = { kind: "detail"; pack: StickerPack } | { kind: "edit"; pack: StickerPack } | { kind: "unavailable" };

export function StickerPackDetail({ pack, onClose, onStickerPick, onRefresh }: { pack?: StickerPack | null; onClose: () => void; onStickerPick: (s: Sticker) => void; onRefresh: () => void }) {
  const [view, setView] = useState<PackView>(pack ? { kind: "detail", pack } : { kind: "unavailable" });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = view.kind === "detail" || view.kind === "edit" ? view.pack : null;

  const stickerWord = (n: number) => {
    const ru = n % 100 >= 11 && n % 100 <= 14 ? "стикеров" : n % 10 === 1 ? "стикер" : n % 10 >= 2 && n % 10 <= 4 ? "стикера" : "стикеров";
    return n === 1 ? "1 стикер" : `${n} ${ru}`;
  };

  const removePackConfirmed = async () => {
    if (!current || busy) return;
    setConfirmRemove(false);
    setBusy(true);
    setError(null);
    try {
      await deleteStickerPack(current.id);
      onRefresh();
      onClose();
    } catch {
      setBusy(false);
      setError("Не удалось удалить пак");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!current || busy) return;
    if (!name.trim()) return setError("Назовите пак");
    setBusy(true);
    setError(null);
    try {
      await updateStickerPack(current.id, { name: name.trim(), description: description === "" ? null : description });
      setView({ kind: "detail", pack: { ...current, name: name.trim(), description: description === "" ? null : description } });
    } catch {
      setBusy(false);
      setError("Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const addStickerImage = async (file: File) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await import("@/shared/api").then((m) => m.uploadFile(file, "image"));
      const { sticker } = await addSticker(current.id, { file: url, emoji: "✨" });
      if (view.kind === "edit") {
        setView({ kind: "edit", pack: { ...current, stickers: [...current.stickers, sticker], stickerCount: current.stickerCount + 1 } });
      }
    } catch {
      setBusy(false);
      setError("Не удалось добавить стикер");
    } finally {
      setBusy(false);
    }
  };

  const removeStickerFromPack = async (stickerId: string) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeSticker(current.id, stickerId);
      const next = current.stickers.filter((s) => s.id !== stickerId);
      if (view.kind === "edit") {
        setView({ kind: "edit", pack: { ...current, stickers: next, stickerCount: next.length } });
      }
      onRefresh();
    } catch {
      setBusy(false);
      setError("Не удалось убрать стикер");
    } finally {
      setBusy(false);
    }
  };

  const moveSticker = (stickerId: string, delta: number) => {
    if (!current || view.kind !== "edit") return;
    const list = [...current.stickers];
    const idx = list.findIndex((s) => s.id === stickerId);
    if (idx < 0) return;
    const target = Math.min(Math.max(0, idx + delta), list.length - 1);
    if (target === idx) return;
    const [moved] = list.splice(idx, 1);
    if (!moved) return;
    list.splice(target, 0, moved);
    list.forEach((s, i) => (s.position = i));
    setView({ kind: "edit", pack: { ...current, stickers: list } });
  };

  if (!current) return null;

  const packName = current.name;
  const isOwner = current.isOwner;
  const count = current.stickerCount;
  const isUnavailable = view.kind === "unavailable";

  const pickSticker = (s: Sticker) => {
    onStickerPick(s);
    onClose();
  };

  return (
    <div className={styles.packDialog}>
      {isUnavailable ? (
        <>
          <h2 className={styles.packName}>Пак удалён</h2>
          <p className={styles.packEmpty}>Этот стикерпак удалён, но отправленные им стикеры остались в чате.</p>
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </>
      ) : view.kind === "edit" ? (
        <>
          <div className={styles.detailHeader}>
            <input className={styles.input} placeholder="Название пака" aria-label="Название пака" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <textarea className={styles.detailDesc} placeholder="Описание пака (необязательно)" aria-label="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <p className={styles.detailHint}>Стикеров: {count}. Добавьте картинку (PNG/WebP) с эмодзи.</p>
          <div className={styles.items}>
            {current.stickers.map((s, i) => (
              <div key={s.id} className={styles.detailCell}>
                <DomNode create={() => renderSticker({ ...s, kind: s.url ? "image" : undefined } as AnimSticker, { size: 44 })} />
                <div className={styles.detailCellControls}>
                  <button type="button" className={styles.iconButton} title="Наверх" aria-label="Наверх" disabled={i === 0} onClick={() => void moveSticker(s.id, -1)}>
                    ↑
                  </button>
                  <button type="button" className={styles.iconButton} title="Вниз" aria-label="Вydown" disabled={i === current.stickers.length - 1} onClick={() => void moveSticker(s.id, 1)}>
                    ↓
                  </button>
                  <button type="button" className={styles.detailRemove} title="Убрать из пака" aria-label={`Убрать «${s.emoji || "стикер"}»`} onClick={() => void removeStickerFromPack(s.id)}>
                    <Icon name="X" size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button type="button" className={styles.addButton} disabled={busy} onClick={() => document.getElementById("sticker-detail-image")?.click()}>
            {busy ? "Загружаем…" : "Добавить стикер (PNG/WebP)"}
          </button>
          <input id="sticker-detail-image" type="file" accept="image/*" multiple hidden data-testid="sticker-detail-images" onChange={(e) => [...(e.target.files ?? [])].forEach((f) => void addStickerImage(f))} />
          <div className={styles.detailActions}>
            <Button variant="secondary" onClick={() => setView({ kind: "detail", pack: current })}>
              Отмена
            </Button>
            <Button disabled={busy} onClick={saveEdit}>{busy ? "Сохраняем…" : "Сохранить"}</Button>
          </div>
          <Button variant="danger" onClick={() => void removePackConfirmed()} style={{ marginLeft: "auto" }}>
            Удалить пак
          </Button>
        </>
      ) : (
        <>
          <div className={styles.detailHeader}>
            <div>
              <h2 className={styles.packName}>{packName}</h2>
              {current.description && <p className={styles.packDesc}>{current.description}</p>}
              <span className={styles.packMeta}>{count} {stickerWord(count)}</span>
            </div>
          </div>
          <p className={styles.detailHint}>Нажмите на стикер, чтобы отправить его в чат.</p>
          <div className={styles.items}>
            {current.stickers.map((s) => (
              <button
                key={s.id || s.url || s.emoji}
                type="button"
                className={styles.item}
                title={s.emoji || "Стикер"}
                aria-label={s.emoji || "Стикер"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pickSticker(s);
                }}
              >
                <DomNode create={() => renderSticker({ ...s, kind: s.url ? "image" : undefined } as AnimSticker, { size: 56 })} />
              </button>
            ))}
          </div>
          {isOwner ? (
            <div className={styles.detailActions}>
              <Button variant="secondary" onClick={() => {
                setName(current.name);
                setDescription(current.description ?? "");
                setView({ kind: "edit", pack: current });
              }}>
                Редактировать пак
              </Button>
              <Button variant="danger" onClick={() => setConfirmRemove(true)}>
                Удалить пак
              </Button>
              {confirmRemove ? (
                <>
                  <p className={styles.packEmpty}>Удалить стикерпак? Сам пак и отправленные им стикеры останутся.</p>
                  <Button variant="danger" onClick={removePackConfirmed}>Удалить</Button>
                  <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Отмена</Button>
                </>
              ) : null}
            </div>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </>
      )}
    </div>
  );
}
