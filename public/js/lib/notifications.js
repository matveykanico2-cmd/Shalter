export function canNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function fireNotification(title, body, opts) {
  if (!canNotify()) return;
  const n = new Notification(title, { body, silent: !opts?.sound });
  n.onclick = () => {
    window.focus();
    opts?.onClick?.();
    n.close();
  };
}
