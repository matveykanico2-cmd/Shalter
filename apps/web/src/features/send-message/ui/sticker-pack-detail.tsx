import { useState } from "react";

import { renderSticker, type Sticker } from "@/shared/lib/anim";
import { Icon } from "@/shared/ui";

import { deleteStickerPack, type StickerPack, updateStickerPack } from "../api/sticker-packs";

import styles from "./sticker-picker.module.css";

type Props = {
  pack: StickerPack;
  onClose: () => void;
  onStickerPick: (s: Sticker) => void;
  onRefresh: () => void;
};

/** Открытый свой пак: название, счётчик, сетка стикеров, удаление стикера/пака, кнопка назад. */
export function StickerPackDetail({ pack, onClose, onStickerPick, onRefresh }: Props) {
  const [stickers, setStickers] = useState(pack.stickers.slice());
  const [name, setName] = useState(pack.name);
  const [busy, setBusy] = useState(false);

  const removeSticker = async (uid: string | undefined) => {
    if (!uid) return;
    const next = stickers.filter((s) => s.uid !== uid);
    setStickers(next);
    try {
      await updateStickerPack(pack.id, { name, stickers: next });
      onRefresh();
    } catch {
      setStickers(pack.stickers.slice());
    }
  };

  const removePack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteStickerPack(pack.id);
      onRefresh();
      onClose();
    } catch {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateStickerPack(pack.id, { name, stickers });
      onRefresh();
      onClose();
    } catch {
      setBusy(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.packDetail}>
      <button type="button" className={styles.backButton} onClick={onClose}>
        <Icon name="ChevronLeft" size={16} />
        Назад
      </button>
      <div className={styles.detailHeader}>
        <input
          className={styles.detailName}
          placeholder="Название пака"
          aria-label="Название пака"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        <span className={styles.detailCount}>{stickers.length} стикер{stickers.length === 1 ? "" : "ов"}</span>
        <button
          type="button"
          className={styles.deletePackButton}
          title="Удалить пак"
          aria-label={`Удалить пак «${pack.name}»`}
          onClick={removePack}
          disabled={busy}
        >
          <Icon name="Trash" size={14} />
          Удалить пак
        </button>
      </div>
      <p className={styles.detailHint}>Нажмите на стикер, чтобы отправить; «Удалить» — убрать из пака.</p>
      <div className={styles.detailGrid}>
        {stickers.map((s) => (
          <div key={s.uid ?? s.url ?? s.emoji ?? ""} className={styles.detailCell}>
            <button
              type="button"
              className={styles.detailSticker}
              title={s.name || s.emoji || "Стикер"}
              aria-label={s.name || s.emoji || "Стикер"}
              onClick={() => onStickerPick(s)}
            >
              {renderSticker(s, { size: 44 })}
            </button>
            <button
              type="button"
              className={styles.detailRemove}
              title="Удалить из пака"
              aria-label={`Удалить «${s.name || s.emoji || "стикер"}` из пака`}
              onClick={() => void removeSticker(s.uid)}
            >
              <Icon name="X" size={11} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={styles.saveButton} disabled={busy} onClick={save}>
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}
