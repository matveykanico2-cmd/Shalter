import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { userQueries } from "@/entities/user/@x/gift";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Avatar, Icon, toast } from "@/shared/ui";

import { giftApi } from "../api/gift-api";
import { giftBackdrop } from "../lib/gift-background";
import { giftTraits } from "../lib/gift-traits";
import { openGiftShop } from "../model/shop-store";
import type { ReceivedGift } from "../model/types";

import styles from "./gift.module.css";
import { GiftCardDialog } from "./gift-card-dialog";
import { GiftGrid, GiftTile } from "./gift-tile";

function compactCount(n: number | undefined) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${Math.round(v / 100) / 10}K`.replace(".", ",");
  return `${Math.round(v / 100_000) / 10}M`.replace(".", ",");
}

type Props = {
  user: { id: string; name: string; giftsReceived?: readonly unknown[] };
  /** Своя полка: можно убрать подарок и закрепить его. */
  isSelf: boolean;
  /** Полка изменилась (убрали, закрепили) — новый пользователь с сервера. */
  onChanged?: (user: { giftsReceived: ReceivedGift[] }) => void;
};

/**
 * Полка подарков в профиле — вкладка «Подарки» в public/js/components/profileDialog.js
 * (как StarGiftsGrid в tweb): аватар дарителя в углу, номер в уголке-ленте, фон-узор у коллекционных.
 */
export function GiftShelf({ user, isSelf, onChanged }: Props) {
  const client = useQueryClient();
  const [open, setOpen] = useState<ReceivedGift | null>(null);
  const gifts = (user.giftsReceived ?? []) as ReceivedGift[];
  if (!gifts.length) return <p className={styles.empty}>Подарков пока нет</p>;
  const ordered = gifts
    .slice()
    .reverse()
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const changed = (next: { giftsReceived: ReceivedGift[] }) => {
    onChanged?.(next);
    void client.invalidateQueries({ queryKey: userQueries.profile(user.id).queryKey });
  };
  const remove = async (g: ReceivedGift) => {
    const serialNote = g.serial != null ? ` Номер №${g.serial} останется занятым.` : "";
    if (!(await askConfirm(`Убрать ${g.emoji} «${g.name}» с вашей полки?${serialNote}`, { okLabel: "Убрать", danger: true }))) return;
    try {
      changed((await giftApi.remove(g.id)).user);
    } catch (err) {
      toast(errorText(err, "Не удалось убрать подарок"), { error: true });
    }
  };
  const togglePin = async (g: ReceivedGift) => {
    try {
      changed((await giftApi.setPinned(g.id, !g.pinned)).user);
    } catch (err) {
      toast(errorText(err, "Не удалось закрепить подарок"), { error: true });
    }
  };

  return (
    <>
      <GiftGrid>
        {ordered.map((g) => {
          const from = g.fromName ? ` · от ${g.fromName}` : "";
          const exclusive = g.serial != null;
          // Фон: выбранный при отправке, у коллекционных без выбора — фон серии.
          const bd = giftBackdrop(g.background ?? (exclusive ? giftTraits(g).backdrop : null));
          const c1 = bd?.center ?? "#6f8cff";
          const c2 = bd?.edge ?? "#2a3dff";
          const corner = g.pinned ? (
            <span className={`${styles.corner} ${styles.pin}`} title="Закреплён">
              <Icon name="Pin" size={14} />
            </span>
          ) : g.anon || !g.fromId ? (
            <span className={`${styles.corner} ${styles.anon}`} title={g.fromName ?? "Аноним"}>
              ?
            </span>
          ) : (
            <span className={styles.corner} title={g.fromName ?? ""}>
              <Avatar size={20} name={g.fromName ?? "?"} color={g.fromAvatarColor} image={g.fromAvatarImage} />
            </span>
          );
          return (
            <GiftTile
              key={g.id}
              gift={g}
              label={g.name}
              title={exclusive ? `${g.name} — №${g.serial} из ${g.supply}${from}` : `${g.name}${from}`}
              backdrop={bd}
              corner={corner}
              badge={exclusive ? { text: g.pinned ? `#${g.serial}` : `1 из ${compactCount(g.supply)}`, style: { background: `linear-gradient(180deg, ${c1} 0%, ${c2} 100%)` } } : null}
              price={g.priceStars ?? 0}
              onClick={() => setOpen(g)}
            />
          );
        })}
      </GiftGrid>
      {open ? (
        <GiftCardDialog
          gift={open}
          ownerName={user.name}
          ownerId={user.id}
          onSend={(backdropId) => openGiftShop({ recipient: isSelf ? null : { id: user.id, name: user.name }, gift: open, backdropId })}
          onRemove={isSelf ? () => void remove(open) : undefined}
          onTogglePin={isSelf ? () => void togglePin(open) : undefined}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
