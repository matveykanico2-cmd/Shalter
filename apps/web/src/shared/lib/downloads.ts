// «Загрузки» Shalter, как public/js/lib/downloads.js: что человек скачивал из чатов (файлы,
// фото, видео, музыка). Список — только в этом браузере; файлы открываются по тем же /uploads/….
import { useSyncExternalStore } from "react";

const KEY = "shalter.downloads";
const MAX = 300;
const EVENT = "shalter:downloads-changed";

export type DownloadKind = "image" | "video" | "audio" | "pdf" | "text" | "file";
export type Download = { url: string; name: string; size: number; kind: DownloadKind; at: number; chatPath?: string };

let cache: Download[] | null = null;

function read(): Download[] {
  if (cache) return cache;
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    cache = Array.isArray(list) ? (list as Download[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: Download[]) {
  cache = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Хранилище недоступно — список доживёт до перезагрузки.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function kindOf(name = "", mime = ""): DownloadKind {
  const n = name.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|bmp|heic)$/.test(n)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/.test(n)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/.test(n)) return "audio";
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(txt|md|csv|json|log|xml|ya?ml|js|ts|py|html?|css|ini|srt)$/.test(n)) return "text";
  return "file";
}

export function recordDownload({ url, name, size, mime }: { url: string; name?: string; size?: number; mime?: string }) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return;
  const fileName = name || url.split("/").pop() || "file";
  const entry: Download = { url, name: fileName, size: size || 0, kind: kindOf(fileName, mime), at: Date.now(), chatPath: location.pathname };
  write([entry, ...read().filter((d) => d.url !== url)]);
}

export const removeDownload = (url: string) => write(read().filter((d) => d.url !== url));
export const clearDownloads = () => write([]);

const subscribe = (l: () => void) => {
  const onChange = () => {
    cache = null;
    l();
  };
  window.addEventListener(EVENT, l);
  // Другая вкладка поменяла список.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, l);
    window.removeEventListener("storage", onChange);
  };
};

export const useDownloads = () => useSyncExternalStore(subscribe, read);

/**
 * Любая ссылка «Скачать» на /uploads/… (файл в чате, просмотрщик, музыка) попадает в «Загрузки».
 * Ловим в фазе захвата, ничего не ломая; размер — из data-bytes ссылки, если он есть.
 */
export function startDownloadTracking() {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[download]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/uploads/") && !href.startsWith(`${location.origin}/uploads/`)) return;
    recordDownload({ url: href.replace(location.origin, ""), name: a.getAttribute("download") || "", size: Number(a.dataset.bytes) || 0 });
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
