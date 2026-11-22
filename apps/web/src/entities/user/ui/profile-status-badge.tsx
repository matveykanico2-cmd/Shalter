import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/shared/ui";

import styles from "./profile-status-badge.module.css";

export type StatusBadgeItem = { id?: string; image: string; name?: string; packId?: string; active?: boolean };
type Subject = { statusIcon?: string | null; statusName?: string | null; statusItems?: readonly StatusBadgeItem[]; name?: string };

/**
 * Значок статуса рядом с именем (ProfileStatusBadge, public/js/components/profileStatusBadge.js):
 * нажатие показывает картинку крупно (statusViewer.js).
 */
export function ProfileStatusBadge({ user, size = 16, onOpenPack }: { user: Subject; size?: number; onOpenPack?: (item: StatusBadgeItem) => void }) {
  const items: readonly StatusBadgeItem[] = user.statusItems?.length
    ? user.statusItems
    : user.statusIcon
      ? [{ image: user.statusIcon, name: user.statusName ?? undefined }]
      : [];
  const [open, setOpen] = useState<StatusBadgeItem | null>(null);
  if (!items.length) return null;
  const show = (item: StatusBadgeItem, e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (item.packId && onOpenPack) {
      setOpen(null);
      onOpenPack(item);
      return;
    }
    setOpen(item);
  };
  return (
    <>
      <span
        className={styles.badges}
        aria-label="Статусы"
        title={items.length === 1 ? items[0]?.name || "Статус" : undefined}
        // Значки часто находятся внутри кликабельной шапки профиля. Гасим
        // событие на контейнере после обработки кнопки, чтобы клик по
        // промежутку между ними и клавиатурные события не открывали профиль.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {items.slice(0, 10).map((item, index) => (
          <button key={item.id ?? `${item.image}-${index}`} type="button" className={styles.badgeButton} title={item.name || "Статус"} aria-label={item.name || "Статус"} onClick={(e) => show(item, e)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); }}>
            <img className={styles.badge} src={item.image} alt="" width={size} height={size} style={{ width: size, height: size }} />
          </button>
        ))}
      </span>
      {open ? <StatusViewer subject={user} item={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function StatusViewer({ subject, item, onClose }: { subject: Subject; item: StatusBadgeItem; onClose: () => void }) {
  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={item.name || "Статус"} style={{ ["--status-glow-image" as string]: `url("${item.image}")` }}>
        <button type="button" className={styles.close} title="Закрыть" aria-label="Закрыть" autoFocus onClick={onClose}>
          <Icon name="X" size={20} />
        </button>
        <img className={styles.image} src={item.image} alt="" />
        {item.name ? <p className={styles.caption}>{item.name}</p> : null}
        {subject.name ? <p className={styles.name}>{subject.name}</p> : null}
      </div>
    </div>,
    document.body
  );
}
