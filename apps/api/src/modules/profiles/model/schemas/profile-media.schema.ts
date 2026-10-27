import { z } from "zod";
import { raw, requestBody, text } from "../../../../common/lib/zod.js";

// Как server/routes/avatars.js, profileStatus.js и profileTrack.js. Аватарку и свой статус
// сервисы проверяют после поиска пользователя (404) и свободного слота (409), поэтому их
// проверки с текстами остаются там; схема только приводит поля.

export const addAvatarSchema = requestBody({
  url: text(),
  kind: z
    .unknown()
    .optional()
    .transform((v) => (v === "video" ? "video" : "image")),
  poster: text(),
});
export type AddAvatarDto = z.infer<typeof addAvatarSchema>;

export const addStatusSchema = requestBody({
  // Любое истинное значение — выбор из каталога (не найдётся — 404), иначе своя картинка.
  catalogId: z
    .unknown()
    .optional()
    .transform((v) => (v ? String(v) : undefined)),
  image: text(),
  name: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim().slice(0, 40)),
});
export type AddStatusDto = z.infer<typeof addStatusSchema>;

// Сравнивается с id статусов через ===, null и отсутствие — снять активный.
export const activeStatusSchema = requestBody({ id: raw() });
export type ActiveStatusDto = z.infer<typeof activeStatusSchema>;

export const addTrackSchema = requestBody({
  // Чей файл — сервис проверяет дальше тем же текстом.
  url: z.unknown().refine((v): v is string => typeof v === "string", {
    error: "Загрузите файл через /api/uploads и передайте полученную ссылку",
  }),
  name: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "Трек").slice(0, 200)),
  size: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
  mimeType: z
    .unknown()
    .optional()
    .transform((v) => (v ? String(v).slice(0, 120) : undefined)),
  duration: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined)),
});
export type AddTrackDto = z.infer<typeof addTrackSchema>;
