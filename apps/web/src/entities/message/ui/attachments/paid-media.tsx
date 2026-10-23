import { useQuery } from "@tanstack/react-query";

import { plural } from "@/shared/lib/presence";

import { paidMediaQuery } from "../../api/paid-media";
import { isVisualMedia } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage as Message } from "../../model/types";

import styles from "./interactive.module.css";

type Meta = { stars?: number; photos?: number; videos?: number; blur?: string; width?: number; height?: number };

function paidContentLabel({ photos = 0, videos = 0 }: Meta) {
  const parts: string[] = [];
  if (photos) parts.push(`${photos} фото`);
  if (videos) parts.push(`${videos} видео`);
  return parts.join(" · ") || "Медиа";
}

type Props = {
  message: Message;
  attachment: Attachment;
  onUnlock?: (m: Message, meta: { stars: number; label: string }) => void;
  /** Открытое содержимое — обычные фото и видео. */
  renderMedia: (attachments: Attachment[]) => React.ReactNode;
};

/**
 * Платный пост канала (paidMedia.js): размыто, пока подписчик не откроет за звёзды.
 * Автору, админам и купившим сервер сразу отдаёт содержимое.
 */
export function PaidMedia({ message: m, attachment, onUnlock, renderMedia }: Props) {
  const meta = (attachment.meta ?? {}) as Meta;
  const paid = useQuery({ ...paidMediaQuery(m.chatId, m.id), enabled: !m.pending });
  const stars = meta.stars ?? 0;
  if (paid.data && "attachments" in paid.data) {
    return (
      <div className={`${styles.paid} ${styles.paidOpen}`}>
        {renderMedia(paid.data.attachments.filter(isVisualMedia))}
        <span className={styles.paidBadge}>⭐ {stars}</span>
      </div>
    );
  }
  const label = paidContentLabel(meta);
  return (
    <div className={styles.paid} style={meta.width && meta.height ? { aspectRatio: `${meta.width} / ${meta.height}` } : undefined}>
      <span className={styles.paidBlur} style={meta.blur ? { backgroundImage: `url("${meta.blur}")` } : undefined} />
      <span className={styles.paidShade} />
      <button type="button" className={styles.paidUnlock} disabled={!onUnlock || m.pending} onClick={() => onUnlock?.(m, { stars, label })}>
        ⭐ Открыть за {stars} {plural(stars, "звезду", "звезды", "звёзд")}
      </button>
      <span className={styles.paidLabel}>{label}</span>
    </div>
  );
}
