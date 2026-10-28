import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { useSession } from "@/entities/session/@x/gift";
import { openUserProfile, userQueries } from "@/entities/user/@x/gift";

import { Avatar, Icon } from "@/shared/ui";

import { giftStars } from "../lib/gift-stars";
import { isReadByOthers } from "../lib/message-meta";
import { convertGift } from "../model/convert-gift";
import { openGiftShop } from "../model/shop-store";
import type { MessageGift } from "../model/types";

import styles from "./gift.module.css";
import { GiftArt, GiftBackdrop } from "./gift-art";
import { GiftCardDialog } from "./gift-card-dialog";

const fmt = (n: number | undefined) => Number(n ?? 0).toLocaleString("ru-RU");

// Анимация появления — один раз за сеанс: прокрутка ленты подарок не «перевыпускает».
const seen = new Set<string>();

type Props = {
  messageId: string;
  gift: MessageGift;
  mine: boolean;
  /** Время и галочки — строкой под карточкой. */
  meta: ReactNode;
  /** Идентификаторы прочитавших — для галочек отправителю. */
  readByIds?: readonly string[];
};

/**
 * Подарок в чате, как в tweb (bubbles/starGift.tsx) — GiftMessage в messageBubble.js: служебная
 * строка «… подарок за N ⭐», под ней карточка — анимация, «Подарок от …», пояснение и кнопки.
 */
export function GiftMessage({ messageId, gift, mine, meta, readByIds }: Props) {
  const [isNew] = useState(() => {
    const fresh = !seen.has(messageId);
    seen.add(messageId);
    return fresh;
  });
  const [card, setCard] = useState(false);
  const client = useQueryClient();
  const me = useSession().data?.user;
  // Имя получателя у отправителя — из его профиля.
  const recipient = useQuery({ ...userQueries.profile(gift.recipientId), enabled: mine && !!gift.recipientId }).data?.user;

  const stars = giftStars(gift);
  const anon = !!gift.anon;
  const fromName = anon ? "Аноним" : gift.fromName || (mine ? "Вы" : "Кто-то");
  const priceText = gift.custom ? "" : ` за ${fmt(stars)} ⭐`;
  const serviceText = mine ? `Вы отправили подарок${priceText}` : anon ? `Вам анонимно подарили подарок${priceText}` : `${fromName} отправил(а) вам подарок${priceText}`;
  const isExclusive = !!gift.exclusive && gift.serial != null;
  const read = mine && readByIds ? isReadByOthers({ readByIds, senderId: gift.fromId ?? me?.id ?? "" }) : false;

  // Имена в подарке открывают профиль (как в Telegram).
  const link = (userId: string, name: string, avatar: ReactNode = null) => (
    <button
      type="button"
      className={`${styles.fromUser} ${styles.nameLink}`}
      title="Открыть профиль"
      onClick={(e) => {
        e.stopPropagation();
        openUserProfile(userId);
      }}
    >
      {avatar}
      <span>{name}</span>
    </button>
  );
  const senderName = mine ? (me?.name ?? fromName) : fromName;
  const sender =
    anon || !gift.fromId ? (
      <span className={styles.fromUser}>{fromName}</span>
    ) : (
      link(
        gift.fromId,
        senderName,
        <Avatar size={16} name={senderName} color={mine ? me?.avatarColor : gift.fromAvatarColor} image={mine ? me?.avatarImage : gift.fromAvatarImage} />
      )
    );
  const note = mine ? (
    recipient ? (
      <p className={styles.note}>{link(gift.recipientId, recipient.name)} может показать этот подарок в своём профиле.</p>
    ) : (
      <p className={styles.note}>Получатель может показать этот подарок в своём профиле.</p>
    )
  ) : (
    <p className={styles.note}>{gift.custom ? "Подарок уже на вашей полке в профиле." : `Подарок на вашей полке в профиле. Его можно обменять на ${fmt(stars)} ⭐.`}</p>
  );
  // Подарок с Premium на звёзды не обменивается (Premium уже выдан).
  const canConvert = !mine && !gift.custom && !(gift.premiumDays === null || gift.premiumDays > 0);

  return (
    <div className={isNew ? styles.gift : `${styles.gift} ${styles.noEntrance}`}>
      <div className={styles.service}>{serviceText}</div>
      {mine && readByIds && (
        <span className={styles.tick} role="img" aria-label={read ? "Прочитано" : "Доставлено"}>
          <Icon name={read ? "CheckCheck" : "Check"} size={14} />
        </span>
      )}
      <div className={styles.box}>
        {isExclusive ? (
          <span className={styles.ribbon}>
            {gift.serial} из {fmt(gift.supply)}
          </span>
        ) : null}
        {gift.background ? <GiftBackdrop src={gift.background} /> : null}
        <div className={styles.boxArt}>
          <GiftArt gift={gift} size={120} replay={isNew} />
        </div>
        <p className={styles.from}>
          Подарок от {sender}
        </p>
        <p className={styles.name}>{gift.durationLabel ? `${gift.name} · ${gift.durationLabel}` : gift.name}</p>
        {gift.note ? <p className={styles.message}>{gift.note}</p> : note}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={(e) => {
              e.stopPropagation();
              setCard(true);
            }}
          >
            Посмотреть
          </button>
          {canConvert && me ? (
            <button
              type="button"
              className={styles.button}
              onClick={(e) => {
                e.stopPropagation();
                void convertGift(gift, me.id, client);
              }}
            >
              Обменять на {fmt(stars)} ⭐
            </button>
          ) : null}
        </div>
        <div className={styles.meta}>{meta}</div>
      </div>
      {card ? (
        <GiftCardDialog
          gift={gift}
          ownerName={recipient?.name ?? (mine ? null : me?.name)}
          ownerId={gift.recipientId ?? (mine ? null : me?.id)}
          onSend={(backdropId) => openGiftShop({ recipient: mine && recipient ? { id: recipient.id, name: recipient.name } : null, gift, backdropId })}
          onClose={() => setCard(false)}
        />
      ) : null}
    </div>
  );
}
