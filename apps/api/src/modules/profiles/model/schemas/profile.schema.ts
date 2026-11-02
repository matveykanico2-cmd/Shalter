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
  avatarEmoji: raw(),
  birthday: raw(),
  businessAddress: raw(),
  businessLat: raw(),
  businessLng: raw(),
  nameColor: raw(),
  profileBanner: raw(),
  profileLinks: raw(),
  currentPassword: raw(),
});
export type PatchProfileDto = z.infer<typeof patchProfileSchema>;

// Кнопки в профиле (как в Telegram). Сервис проверяет их после «чужого профиля» (403),
// поэтому это отдельная схема, а не часть patchProfileSchema; null — убрать все.
export const MAX_PROFILE_LINKS = 3;
const PROFILE_LINK_USERNAME_RE = /^@[a-zA-Z0-9_]{3,32}$/;
const profileLinkTarget = z
  .string("Некорректная ссылка кнопки")
  .trim()
  .refine((v) => {
    if (PROFILE_LINK_USERNAME_RE.test(v)) return true;
    if (v.length > 512 || !v.startsWith("https://")) return false;
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Кнопка ведёт на @ник или https-ссылку");
export const profileLinksSchema = z
  .array(
    z.strictObject(
      {
        title: z.string("Введите название кнопки").trim().min(1, "Введите название кнопки").max(32, "Название кнопки — не длиннее 32 символов"),
        target: profileLinkTarget,
      },
      "Некорректная кнопка"
    ),
    "Некорректные кнопки"
  )
  .max(MAX_PROFILE_LINKS, `Не больше ${MAX_PROFILE_LINKS} кнопок`)
  .nullable();

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
