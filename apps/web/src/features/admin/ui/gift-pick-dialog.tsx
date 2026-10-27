import { Dialog } from "@/shared/ui";

import type { CatalogGift } from "../api/admin";
import { fmtNumber } from "../lib/format";

import styles from "./admin.module.css";
import { GiftArt } from "./gift-art";

type Props = { title: string; gifts: readonly CatalogGift[]; onPick: (gift: CatalogGift) => void; onClose: () => void };

/** Выбор подарка из витрины — openGiftPickerDialog в public/js/components/giftPickerDialog.js (без оплаты: админ дарит сам). */
export function GiftPickDialog({ title, gifts, onPick, onClose }: Props) {
  return (
    <Dialog title={title} onClose={onClose} className={styles.card}>
      <div className={styles.cardBody}>
        {gifts.map((g) => (
          <button
            key={g.id}
            type="button"
            className={styles.row}
            onClick={() => {
              onClose();
              onPick(g);
            }}
          >
            <GiftArt gift={g} />
            <span className={styles.rowBody}>
              <span className={styles.rowName}>{g.name}</span>
              <span className={styles.rowMeta}>{`⭐ ${fmtNumber(g.priceStars)}`}</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" className={styles.close} onClick={onClose}>
        Отмена
      </button>
    </Dialog>
  );
}
