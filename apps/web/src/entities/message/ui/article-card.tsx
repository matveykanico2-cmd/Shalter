import type { ReactNode } from "react";

import { articleCover, splitArticle } from "../lib/article";
import type { Message } from "../model/types";

import styles from "./article-card.module.css";
import { MessageText } from "./message-text";

type Props = {
  message: Message;
  /** Время с галочками — в подвале рядом со значком Premium. */
  meta?: ReactNode;
  /** Обложка открывается в просмотре фото. */
  onOpenCover?: (url: string) => void;
};

/**
 * Статья (ArticleBody в messageBubble.js): обложка, заголовок, тело в markdown и подвал
 * «⭐ Premium». Старые записи без текста — «Статья недоступна».
 */
export function ArticleCard({ message, meta, onOpenCover }: Props) {
  const { title, body } = splitArticle(message.text);
  const cover = articleCover(message);
  const coverSrc = cover?.thumbUrl || cover?.url || null;
  const footer = (
    <div className={styles.footer}>
      <span className={styles.badge}>⭐ Premium</span>
      {meta}
    </div>
  );
  if (!title && !body) {
    return (
      <div className={styles.card}>
        <p className={styles.unavailable}>Статья недоступна</p>
        {footer}
      </div>
    );
  }
  const img = coverSrc ? <img className={styles.cover} src={coverSrc} alt="" loading="lazy" decoding="async" /> : null;
  return (
    <article className={styles.card} aria-label={title || "Статья"}>
      {img && cover?.url && onOpenCover ? (
        <button
          type="button"
          className={styles.coverButton}
          title="Открыть обложку"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCover(cover.url!);
          }}
        >
          {img}
        </button>
      ) : (
        img
      )}
      <div className={styles.content}>
        {title ? <h2 className={styles.title}>{title}</h2> : null}
        {body ? <MessageText text={body} markdown customEmoji={Array.isArray(message.customEmoji) ? message.customEmoji : undefined} /> : null}
      </div>
      {footer}
    </article>
  );
}
