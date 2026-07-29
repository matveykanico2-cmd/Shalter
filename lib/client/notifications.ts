"use client";

export function canNotify() {
  return typeof window !== "undefined" && typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function fireNotification(title: string, body: string, opts?: { sound?: boolean; onClick?: () => void }) {
  if (!canNotify()) return;
  const n = new Notification(title, { body, silent: !opts?.sound });
  n.onclick = () => {
    window.focus();
    opts?.onClick?.();
    n.close();
  };
}
