import { type BuiltinStickerPack, DRAWN_STICKERS, MASCOT_PACKS, renderSticker, type Sticker } from "@/shared/lib/anim";
import { DomNode } from "@/shared/ui";

import styles from "./sticker-picker.module.css";

/** Встроенные наборы: рисованные стикеры Shalter и персонажи (котик, лисёнок, утёнок, зайка). */
const BUILTIN_STICKER_PACKS: readonly BuiltinStickerPack[] = [{ id: "builtin_classic", name: "Shalter", stickers: DRAWN_STICKERS }, ...MASCOT_PACKS];

/** Встроенные стикерпаки в панели стикеров: есть у всех, добавлять не нужно. */
export function BuiltinStickerPacks({ onPick }: { onPick: (s: Sticker) => void }) {
  return (
    <>
      <h3 className={styles.heading}>Встроенные</h3>
      {BUILTIN_STICKER_PACKS.map((pack) => (
        <section key={pack.id} className={styles.packSection} aria-label={pack.name}>
          <div className={styles.packHeader}>
            <span aria-hidden="true" style={{ display: "inline-flex", width: 28, height: 28 }}>
              <DomNode create={() => renderSticker(pack.stickers[0], { size: 28 })} />
            </span>
            <span className={styles.packName}>{pack.name}</span>
            <span className={styles.packMeta}>{pack.stickers.length} шт.</span>
          </div>
          <div className={styles.items}>
            {pack.stickers.map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.item}
                title={s.name}
                aria-label={`${s.emoji} ${s.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(s);
                }}
              >
                <DomNode create={() => renderSticker(s, { size: 52 })} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
