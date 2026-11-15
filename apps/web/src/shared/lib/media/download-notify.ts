import { toast } from "../../ui/toast-store";

const displayName = (name: string | undefined, fallback: string) => {
  const value = name?.trim();
  return value ? `«${value}»` : fallback;
};

export function notifyDownloadStart(name?: string, fallback = "медиа") {
  toast(`Скачивание ${displayName(name, fallback)} началось`);
}

export function notifyMediaError(name?: string, fallback = "медиа") {
  toast(`Не удалось загрузить ${displayName(name, fallback)}`, { error: true });
}
