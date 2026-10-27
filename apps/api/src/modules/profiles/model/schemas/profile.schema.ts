import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — со своими текстами ошибок, как server/routes/users.js: чужой
// профиль (403) отсекается раньше любой проверки поля, а правится только присланное
// (`"x" in body`), поэтому схема лишь оставляет известные поля как пришли.
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

// Не массив — пустой список; не строки отбрасываются.
export const pinnedChannelsSchema = requestBody({
  chatIds: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v.filter((id): id is string => typeof id === "string") : [])),
});
export type PinnedChannelsDto = z.infer<typeof pinnedChannelsSchema>;

// «Себя» сервис проверяет раньше (по id из пути), поэтому схема только приводит флаг.
export const blockSchema = requestBody({
  blocked: z
    .unknown()
    .optional()
    .transform((v) => !!v),
});
export type BlockDto = z.infer<typeof blockSchema>;
