// Помощники модулей профиля (users, profile, settings). Только HTTP — как support/seed.ts.
import { randomBytes } from "node:crypto";
import { expect } from "vitest";
import type { TestUser } from "../../support/seed";
import { upload } from "../uploads/helpers";

/** Минимальное превью аватарки/постера — data:image/png (lib/avatars.js POSTER_RE). */
export const POSTER = "data:image/png;base64,iVBORw0KGgo=";

/**
 * Ссылка «как из /api/uploads» (/uploads/<вид>_<16 hex>.<ext>) без файла — для
 * проверок отказа: аватарки, баннер, музыка профиля, стикеры, истории, обои и т. п.
 * принимают только свою (или уже доступную) загрузку — для них {@link uploadedUrl}.
 */
export function fakeUploadUrl(ext = "png"): string {
  return `/uploads/img_${randomBytes(8).toString("hex")}.${ext}`;
}

/** Загружает случайные байты от имени пользователя и возвращает ссылку /uploads/…. */
export async function uploadedUrl(user: TestUser, ext = "png", kind = "image"): Promise<string> {
  const res = await upload(user.api, randomBytes(64), { kind, name: `f.${ext}` });
  expect(res.status, res.text).toBe(200);
  return res.body.url;
}

/** Добавляет аватарку через POST /api/avatars. */
export async function addAvatar(user: TestUser, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await user.api.post("/api/avatars", { url: await uploadedUrl(user), poster: POSTER, ...extra });
  expect(res.status, res.text).toBe(200);
  return res.body;
}

export async function patchMe(user: TestUser, patch: Record<string, unknown>): Promise<any> {
  const res = await user.api.patch(`/api/users/${user.id}`, patch);
  expect(res.status, res.text).toBe(200);
  return res.body.user;
}
