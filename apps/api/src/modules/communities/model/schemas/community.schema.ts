import { z } from "zod";
import { raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";
import { cleanAddMode, cleanDescription, cleanTitle, cleanVisible } from "../../lib/community-fields.js";
import { cleanRights, DEFAULT_ADMIN_RIGHTS } from "../../lib/community-rights.js";

// Поля приводятся так же, как в server/routes/communities.js. Почти все проверки там идут
// после загрузки сообщества (404/403), поэтому их тексты отвечает сервис; в схеме — только
// то, что маршрут проверяет первым делом (название нового сообщества).
// Аватар остаётся как пришёл: его проверяет isSafeUrl из server/ (мост), уже в сервисе.

/** Поле правки: нет поля — undefined (не меняется), иначе очищенное значение (null — тоже). */
const patchField = <T>(clean: (v: unknown) => T) => raw().transform((v) => (v === undefined ? undefined : clean(v)));

export const createCommunitySchema = requestBody({
  title: raw()
    .transform(cleanTitle)
    .refine((v) => !!v, { error: "Введите название сообщества" }),
  description: raw().transform(cleanDescription),
  avatarColor: raw().transform((v) => (typeof v === "string" ? v.slice(0, 20) : null)),
  avatarImage: raw(),
  addMode: raw().transform((v) => cleanAddMode(v) ?? "all"),
  /** id первого чата; пустое — без чата, не строка — «Чат не найден» в сервисе. */
  chatId: raw(),
  chatVisible: raw().transform((v) => cleanVisible(v) ?? true),
});
export type CreateCommunityDto = z.infer<typeof createCommunitySchema>;

export const patchCommunitySchema = requestBody({
  title: patchField(cleanTitle),
  description: patchField(cleanDescription),
  avatarImage: raw(),
  /** Неизвестный режим — null: 400 в сервисе, но только после проверки права. */
  addMode: patchField((v) => cleanAddMode(v) ?? null),
});
export type PatchCommunityDto = z.infer<typeof patchCommunitySchema>;

export const prefsSchema = requestBody({ pinned: raw().transform(cleanVisible), collapsed: raw().transform(cleanVisible) });
export type PrefsDto = z.infer<typeof prefsSchema>;

export const muteSchema = requestBody({
  hours: raw().transform(Number),
  forever: raw().transform((v) => v === true),
  off: raw().transform((v) => v === true),
});
export type MuteDto = z.infer<typeof muteSchema>;

export const membersQuerySchema = requestQuery({ q: text().transform((v) => v.trim().toLowerCase()) });
export type MembersQuery = z.infer<typeof membersQuerySchema>;

export const addChatSchema = requestBody({ chatId: raw(), visible: raw().transform((v) => cleanVisible(v) ?? true) });
export type AddChatDto = z.infer<typeof addChatSchema>;

/** Не true/false — undefined: 400 в сервисе после проверки, что чат в сообществе. */
export const chatVisibleSchema = requestBody({ visible: raw().transform(cleanVisible) });
export type ChatVisibleDto = z.infer<typeof chatVisibleSchema>;

export const decideRequestSchema = requestBody({ approve: raw().transform((v) => v === true) });
export type DecideRequestDto = z.infer<typeof decideRequestSchema>;

/** Нет прав (или null) — права админа по умолчанию. */
export const adminRightsSchema = requestBody({ rights: raw().transform((v) => cleanRights(v ?? DEFAULT_ADMIN_RIGHTS)) });
export type AdminRightsDto = z.infer<typeof adminRightsSchema>;

/** Значок и подпись рядом с именем участника сообщества (ставит админ). Пустая строка — убрать. */
export const adminBadgeTitleSchema = requestBody({ badge: raw().transform((v) => (typeof v === "string" ? v.slice(0, 20) : null)), title: raw().transform((v) => (typeof v === "string" ? v.slice(0, 40) : null)) });
export type AdminBadgeTitleDto = z.infer<typeof adminBadgeTitleSchema>;
