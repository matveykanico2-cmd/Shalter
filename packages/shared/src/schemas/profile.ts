// Оформление профиля: аватарки (server/routes/avatars.js), статусы-иконки
// (server/routes/profileStatus.js, каталог — /api/status-catalog) и музыка
// (server/routes/profileTrack.js). Везде в ответе — publicUser себя.
import { z } from "zod";
import { isoDate } from "./common";
import { publicUser } from "./user";
import { avatarEntry } from "./users";

export const avatarsListBody = z.strictObject({ avatars: z.array(avatarEntry), max: z.literal(6) });
export const avatarsChangeBody = z.strictObject({ user: publicUser, avatars: z.array(avatarEntry) });

/** id статуса: us_<base36 время>_<6 символов>. */
export const statusItemId = z.string().regex(/^us_[a-z0-9]+_[a-z0-9]{1,6}$/);
/** id в каталоге: st_<base36 время>_<6 символов> (data/profileStatuses.js). */
export const catalogItemId = z.string().regex(/^st_[a-z0-9]+_[a-z0-9]{1,6}$/);

export const statusItem = z.strictObject({
  id: statusItemId,
  image: z.string().regex(/^data:image\/(png|jpeg|webp|gif);base64,/),
  name: z.string(),
  // Только у статуса из каталога.
  catalogId: catalogItemId.optional(),
  addedAt: isoDate,
});

export const statusMeBody = z.strictObject({
  items: z.array(statusItem),
  activeId: statusItemId.nullable(),
  max: z.union([z.literal(1), z.literal(5)]),
});
export const statusChangeBody = z.strictObject({ user: publicUser, items: z.array(statusItem), activeId: statusItemId.nullable() });
export const statusActiveBody = z.strictObject({ user: publicUser, activeId: statusItemId.nullable() });

export const catalogItem = z.strictObject({ id: catalogItemId, image: z.string(), name: z.string(), createdAt: isoDate });
export const statusCatalogBody = z.strictObject({ items: z.array(catalogItem) });
/** POST /api/admin/status-catalog (наполнение каталога для тестов статусов). */
export const catalogCreateBody = z.strictObject({ item: catalogItem });

/** Трек профиля: size/mimeType/duration — только когда переданы корректно. */
export const profileTrack = z.strictObject({
  url: z.string().startsWith("/uploads/"),
  name: z.string(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  duration: z.number().int().positive().optional(),
  at: isoDate,
});
export const profileTrackBody = z.strictObject({ user: publicUser });
