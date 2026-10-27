import { type CSSProperties, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { openUserProfile } from "@/entities/user/@x/gift";

import { Avatar, Button } from "@/shared/ui";

import { giftBackdrop } from "../lib/gift-background";
import { giftTraits } from "../lib/gift-traits";
import type { GiftLike } from "../model/types";

import { GiftArt } from "./gift-art";
import styles from "./gift-card-dialog.module.css";

type Props = {
  gift: GiftLike;
  ownerName?: string | null;
  ownerId?: string | null;
  /** «Отправить такой же»; backdropId — нажали на фон или узор (отправка с этим фоном). */
  onSend?: (backdropId: string | null) => void;
  onRemove?: () => void;
  onTogglePin?: () => void;
  onClose: () => void;
};

/** Карточка подарка — openGiftCardDialog в public/js/components/giftCardDialog.js. */
export function GiftCardDialog({ gift, ownerName, ownerId, onSend, onRemove, onTogglePin, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const traits = giftTraits(gift);
  // Выбранный при отправке фон — он и показываем; у коллекционных без выбора — фон серии.
  const backdrop = giftBackdrop(gift.background ?? traits.backdrop)!;
  const symbol = backdrop.symbol ?? traits.symbol;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // Имя — ссылка на профиль: карточка закрывается, открывается профиль.
  const profileLink = (userId: string, name: string, avatar: ReactNode = null) => (
    <button type="button" className={styles.sender} title="Открыть профиль" onClick={act(() => openUserProfile(userId))}>
      {avatar}
      {name}
    </button>
  );
  const row = (label: string, value: ReactNode, rarity?: number | null) => (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {value}
        {rarity != null ? <span className={styles.rarity}>{rarity}%</span> : null}
      </span>
    </div>
  );
  // Нажатие на атрибут сразу открывает отправку этого подарка с этим фоном (как в tweb).
  const attrRow = (label: string, value: string, rarity?: number | null) =>
    onSend ? (
      <button type="button" className={`${styles.row} ${styles.attr}`} title="Отправить подарок с этим фоном" onClick={act(() => onSend(backdrop.id || null))}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {value}
          {rarity != null ? <span className={styles.rarity}>{rarity}%</span> : null}
        </span>
      </button>
    ) : (
      row(label, value, rarity)
    );

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={gift.name ?? "Подарок"}>
        <div className={styles.hero} style={{ "--gift-from": backdrop.center, "--gift-to": backdrop.edge } as CSSProperties}>
          <div className={styles.pattern} style={{ "--gift-symbol": `url("${symbol.image}")`, "--gift-pattern": backdrop.pattern } as CSSProperties}>
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <div className={styles.emoji}>
            <GiftArt gift={gift} size={96} />
          </div>
          <p className={styles.name}>{gift.name}</p>
          <p className={styles.serial}>{gift.serial != null ? `Коллекционный подарок №${gift.serial}` : "Подарок"}</p>
        </div>
        <div className={styles.rows}>
          {ownerName ? row("Владелец", ownerId ? profileLink(ownerId, ownerName) : ownerName) : null}
          {gift.fromName
            ? row(
                "От кого",
                gift.anon || !gift.fromId
                  ? gift.fromName
                  : profileLink(gift.fromId, gift.fromName, <Avatar size={20} name={gift.fromName} color={gift.fromAvatarColor} image={gift.fromAvatarImage} />)
              )
            : null}
          {gift.note ? row("Сообщение", gift.note) : null}
          {row("Модель", traits.model.name, traits.model.rarity)}
          {attrRow("Фон", backdrop.name || "Без фона", backdrop.rarity)}
          {attrRow("Узор", symbol.name, symbol.rarity)}
          {gift.serial != null && gift.supply ? row("Количество", `${gift.serial}/${gift.supply} выпущено`) : null}
          {gift.priceStars ? row("Цена", `⭐ ${Number(gift.priceStars).toLocaleString("ru-RU")}`) : null}
        </div>
        <div className={styles.buttons}>
          {onSend ? <Button onClick={act(() => onSend(null))}>Отправить такой же</Button> : null}
          {onTogglePin ? (
            <Button variant="secondary" onClick={act(onTogglePin)}>
              {gift.pinned ? "Открепить" : "Закрепить на профиле"}
            </Button>
          ) : null}
          {onRemove ? (
            <Button variant="danger" onClick={act(onRemove)}>
              Убрать с полки
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
