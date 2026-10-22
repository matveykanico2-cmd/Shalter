import type { AvatarEntry } from "../../users/model/domain.js";

// Проверка новой аватарки — как server/lib/avatars.js (avatars.spec.ts сверяет их).

export const MAX_AVATARS = 6;
const MAX_POSTER_BYTES = 400 * 1024;

const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
const POSTER_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function validateEntry(raw: { url?: unknown; kind?: unknown; poster?: unknown }): { entry: AvatarEntry; error?: undefined } | { error: string } {
  const url = String(raw?.url ?? "");
  if (!UPLOAD_URL_RE.test(url)) return { error: "Некорректная ссылка на файл" };

  const kind = raw?.kind === "video" ? "video" : "image";

  const poster = String(raw?.poster ?? "");
  if (!poster) return { error: "Нет превью для аватарки" };
  if (!POSTER_RE.test(poster)) return { error: "Некорректное превью" };
  if (poster.length > MAX_POSTER_BYTES) return { error: "Превью слишком большое" };

  return { entry: { url, kind, poster } };
}
