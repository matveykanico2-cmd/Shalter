import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/shared/ui";

import styles from "./profile-status-badge.module.css";

type Subject = { statusIcon?: string | null; statusName?: string | null; name?: string };

/**
 * Значок статуса рядом с именем (ProfileStatusBadge, public/js/components/profileStatusBadge.js):
 * нажатие показывает картинку крупно (statusViewer.js).
 */
export function ProfileStatusBadge({ user, size = 16 }: { user: Subject; size?: number }) {
  const [open, setOpen] = useState(false);
  if (!user.statusIcon) return null;
  const show = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    setOpen(true);
  };
  return (
    <>
      <span
        className={styles.badgeButton}
        role="button"
        tabIndex={0}
        title={user.statusName || "Статус"}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          show(e);
        }}
      >
        <img className={styles.badge} src={user.statusIcon} alt="" style={{ width: size, height: size }} />
      </span>
      {open ? <StatusViewer subject={user} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function StatusViewer({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={subject.statusName || "Статус"} style={{ ["--status-glow-image" as string]: `url("${subject.statusIcon}")` }}>
        <button type="button" className={styles.close} title="Закрыть" aria-label="Закрыть" autoFocus onClick={onClose}>
          <Icon name="X" size={20} />
        </button>
        <img className={styles.image} src={subject.statusIcon ?? ""} alt="" />
        {subject.statusName ? <p className={styles.caption}>{subject.statusName}</p> : null}
        {subject.name ? <p className={styles.name}>{subject.name}</p> : null}
      </div>
    </div>,
    document.body
  );
}
