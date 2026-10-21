import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — со своими текстами ошибок, как server/routes/users.js; схема
// только оставляет известные поля (`"x" in body` там же).
export const patchProfileSchema = requestBody({
  name: raw(),
  lastName: raw(),
  username: raw(),
  phone: raw(),
  bio: raw(),
  avatarColor: raw(),
  avatarImage: raw(),
  birthday: raw(),
  businessAddress: raw(),
  businessLat: raw(),
  businessLng: raw(),
  nameColor: raw(),
  profileBanner: raw(),
  currentPassword: raw(),
});
export type PatchProfileDto = z.infer<typeof patchProfileSchema>;

export const pinnedChannelsSchema = requestBody({ chatIds: raw() });
export type PinnedChannelsDto = z.infer<typeof pinnedChannelsSchema>;

export const blockSchema = requestBody({ blocked: raw() });
export type BlockDto = z.infer<typeof blockSchema>;
