// Файл из «Поделиться» приходит base64 — как base64ToFile/kindFor в shareInboxDialog.js.
import type { SharePayload } from "../api/share";

export type ShareKind = "image" | "video" | "audio" | "file";

export function kindFor(file: File): ShareKind {
  const type = file.type ?? "";
  for (const kind of ["image", "video", "audio"] as const) if (type.startsWith(`${kind}/`)) return kind;
  return "file";
}

export function base64ToFile(payload: NonNullable<SharePayload["file"]>) {
  const bin = atob(payload.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], payload.name || "shared", { type: payload.type || "application/octet-stream" });
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Размер как formatSize в public/js/lib/uploadLimits.js. */
export function formatSize(bytes: number) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} ГБ`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}
