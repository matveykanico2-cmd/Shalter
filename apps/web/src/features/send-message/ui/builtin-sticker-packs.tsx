import { type BuiltinStickerPack, renderSticker, type Sticker } from "@/shared/lib/anim";
import { DomNode } from "@/shared/ui";

import { BUILTIN_STICKER_PACKS } from "../lib/builtin-packs";

import styles from "./sticker-picker.module.css";

/** Встроенные стикерпаки в панели стикеров: есть у всех, добавлять не нужно; заголовок открывает пак. */
export function BuiltinStickerPacks({ onPick, onOpen }: { onPick: (s: Sticker) => void; onOpen: (pack: BuiltinStickerPack) => void }) {
  return (
    <>
      <h3 className={styles.heading}>Встроенные</h3>
      {BUILTIN_STICKER_PACKS.map((pack) => (
        <section key={pack.id} className={styles.packSection} aria-label={pack.name} data-pack={pack.id}>
          <button type="button" className={styles.packHeader} title="Открыть пак" aria-label={`Открыть пак «${pack.name}»`} onClick={() => onOpen(pack)}>
            <span className={styles.packName}>{pack.name}</span>
            <span className={styles.packMeta}>{pack.stickers.length}</span>
          </button>
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
                <DomNode viewport create={() => renderSticker(s, { size: 56, lazy: true })} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
