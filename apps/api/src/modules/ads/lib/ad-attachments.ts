import { isSafeUrl } from "../../../legacy/legacy.js";
import type { AdAttachment } from "../model/domain.js";

// Вложения объявления в кабинете рекламы (server/routes/ads.js): картинки, видео и файлы
// с безопасной ссылкой, не больше шести.
const KINDS = new Set(["image", "video", "file"]);
const MAX_AD_ATTACHMENTS = 6;

function sanitizeAdAttachment(a: unknown): AdAttachment | null {
  const raw = a as Record<string, unknown> | null | undefined;
  if (!raw || !KINDS.has(raw.kind as string) || !isSafeUrl(raw.url)) return null;
  const out: AdAttachment = { kind: raw.kind as string, url: raw.url as string };
  if (raw.name !== undefined) out.name = String(raw.name).slice(0, 300);
  if (raw.size !== undefined) out.size = Number.isFinite(raw.size) ? (raw.size as number) : undefined;
  return out;
}

export function sanitizeAdAttachments(list: unknown): AdAttachment[] {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_AD_ATTACHMENTS)
    .map(sanitizeAdAttachment)
    .filter((a): a is AdAttachment => !!a);
}
