import { openGiftShop } from "@/entities/gift/@x/message";

import { Avatar, Icon, openInAppBrowser, openInstantView } from "@/shared/ui";

import type { Attachment, LinkPreview } from "../../model/attachment";

import styles from "./attachments.module.css";

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Геопозиция — ссылка на карту; живая — с пометкой до какого времени (attachments.js). */
export function LocationAttachment({ attachment: a }: { attachment: Attachment }) {
  const { lat, lng, live, expiresAt } = (a.meta ?? {}) as { lat?: number; lng?: number; live?: boolean; expiresAt?: string };
  const isLive = !!live && !!expiresAt && expiresAt > new Date().toISOString();
  const label = isLive ? `Живая геолокация — обновляется до ${TIME.format(new Date(expiresAt))}` : live ? "Геолокация (трансляция окончена)" : "Геолокация";
  return (
    <a
      className={isLive ? `${styles.location} ${styles.live}` : styles.location}
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name="MapPin" size={18} />
      <span>
        <span className={styles.locationLabel}>{label}</span>
        <span className={styles.coords}>
          {lat?.toFixed(5)}, {lng?.toFixed(5)}
        </span>
      </span>
    </a>
  );
}

/** Контакт: имя и телефон (добавление в контакты придёт с экраном контактов). */
export function ContactAttachment({ attachment: a }: { attachment: Attachment }) {
  const { name, phone } = (a.meta ?? {}) as { name?: string; phone?: string };
  return (
    <div className={styles.contact}>
      <Icon name="Users" size={18} />
      <span className={styles.contactBody}>
        <span className={styles.contactName}>{name || "Контакт"}</span>
        {phone ? <span className={styles.coords}>{phone}</span> : null}
      </span>
    </div>
  );
}

/** День рождения друга (BirthdayAttachment в messageBubble.js): «Быстро:» — подарки-подсказки и «Подарить». */
export function BirthdayAttachment({ attachment: a, meId }: { attachment: Attachment; meId: string }) {
  const { userId, name, avatarImage, suggestedGifts } = (a.meta ?? {}) as {
    userId?: string;
    name?: string;
    avatarImage?: string;
    suggestedGifts?: { id: string; emoji: string; name: string }[];
  };
  const canGift = !!userId && userId !== meId;
  const quick = (suggestedGifts ?? []).slice(0, 4);
  const recipient = userId ? { id: userId, name: name || "Друг" } : null;
  return (
    <div className={`${styles.contact} ${styles.birthday}`}>
      <Avatar size={36} name={name || "Друг"} image={avatarImage} />
      <span className={styles.contactBody}>
        <span className={styles.contactName}>🎂 {name || "Друг"}</span>
        <span className={styles.coords}>День рождения сегодня</span>
        {canGift && quick.length ? (
          <span className={styles.giftHints}>
            <span className={styles.giftHintLabel}>Быстро:</span>
            {quick.map((g) => (
              <button
                key={g.id}
                type="button"
                className={styles.giftHint}
                title={g.name}
                onClick={(e) => {
                  e.stopPropagation();
                  openGiftShop({ recipient, gift: g });
                }}
              >
                {g.emoji}
              </button>
            ))}
          </span>
        ) : null}
      </span>
      {canGift ? (
        <button
          type="button"
          className={styles.contactAdd}
          onClick={(e) => {
            e.stopPropagation();
            openGiftShop({ recipient });
          }}
        >
          🎁 Подарить
        </button>
      ) : null}
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Карточка ссылки (LinkPreviewCard в attachments.js): открывается во встроенном браузере. */
export function LinkPreviewCard({ preview: p }: { preview: LinkPreview }) {
  const images = p.images?.length ? p.images : p.image ? [p.image] : [];
  const safety = { unsafe: !!p.unsafe, warning: p.warning ?? null };
  // Карточка — кнопка, как link-card в старом клиенте: открывает встроенный браузер.
  const card = (
    <button
      type="button"
      className={styles.linkCard}
      onClick={(e) => {
        e.stopPropagation();
        openInAppBrowser(p.url, safety);
      }}
    >
      {images.length ? (
        <span className={p.video ? `${styles.linkMedia} ${styles.linkVideo}` : styles.linkMedia}>
          <img
            className={styles.linkImage}
            src={images[0]}
            alt=""
            loading="lazy"
            decoding="async"
            // Заставка ролика: maxresdefault есть не у всех видео — пробуем следующие.
            onError={(e) => {
              const img = e.currentTarget;
              const next = images[images.indexOf(img.getAttribute("src") ?? "") + 1];
              if (next) img.src = next;
              else img.remove();
            }}
          />
          {p.video ? (
            <span className={styles.linkPlay}>
              <Icon name="PlayFill" size={22} />
            </span>
          ) : null}
        </span>
      ) : null}
      <span className={styles.linkBody}>
        {p.warning ? (
          <span className={p.unsafe ? `${styles.linkWarning} ${styles.linkDanger}` : styles.linkWarning}>
            <Icon name="Info" size={12} /> {p.warning}
          </span>
        ) : null}
        {p.title ? <span className={styles.linkTitle}>{p.title}</span> : null}
        {p.description ? <span className={styles.linkDesc}>{p.description}</span> : null}
        <span className={styles.linkSite}>
          <Icon name="Link" size={12} /> {p.siteName || hostOf(p.url)}
        </span>
      </span>
    </button>
  );
  // Instant View — для статей (есть заголовок и описание), не для голых ссылок.
  if (!p.title || !p.description || p.unsafe) return card;
  return (
    <span className={styles.linkWrap}>
      {card}
      <button
        type="button"
        className={styles.linkInstantView}
        onClick={(e) => {
          e.stopPropagation();
          openInstantView(p.url, safety);
        }}
      >
        ⚡ Быстрый просмотр
      </button>
    </span>
  );
}
