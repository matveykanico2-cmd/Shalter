import { z } from "zod";
import { ADMIN_SECTIONS } from "../../../../common/config/accounts.js";
import { raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";

// Все проверки раздела идут после права на раздел (403) и поиска цели (404), как в
// server/routes/admin.js, поэтому схемы только приводят поля к тем же значениям, что и
// старый маршрут, а ошибки с текстами отвечает сервис.

const MAX_BAN_SEC = 10 * 365 * 24 * 3600;

/** `String(x ?? "").trim()`. */
const trimmed = () => text().transform((v) => v.trim());

/** Причина действия модерации: до 500 символов; пустую отклоняет сервис. */
const reason = () => trimmed().transform((v) => v.slice(0, 500));

/** Подтверждение опасного действия: введённый @ник или id без «@», в нижнем регистре. */
const confirm = () => trimmed().transform((v) => v.replace(/^@/, "").toLowerCase());

/** id метки: латиница, цифры и «_», до 24 символов. */
const normalizeLabelId = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);

/** Поле метки при правке: нет поля — undefined (остаётся прежнее), иначе строка без пробелов по краям до max. */
const labelPatchField = (max: number) => raw().transform((v) => (v === undefined ? undefined : String(v).trim().slice(0, max)));

/** Юридический поиск: только строка (массив из ?q=…&q=… — как пусто). */
export const legalLookupQuerySchema = requestQuery({ q: raw().transform((v) => (typeof v === "string" ? v.trim() : "")) });
export type LegalLookupQuery = z.infer<typeof legalLookupQuerySchema>;

export const chatLookupQuerySchema = requestQuery({ q: trimmed() });
export type ChatLookupQuery = z.infer<typeof chatLookupQuerySchema>;

export const directoryQuerySchema = requestQuery({
  type: raw().transform((v) => (typeof v === "string" && ["users", "bots", "groups", "channels"].includes(v) ? v : "users")),
  q: trimmed().transform((v) => v.toLowerCase()),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

export const exportSchema = requestBody({
  /** id цели: не строка — нет такого пользователя (404 в сервисе). */
  userId: raw().transform((v) => (typeof v === "string" ? v : undefined)),
  /** Основание; пустое (или 0, false) — "", его отклоняет сервис. */
  reason: raw().transform((v) => (v ? String(v).trim() : "")),
});
export type ExportDto = z.infer<typeof exportSchema>;

export const banSchema = requestBody({
  banned: raw().transform((v) => v !== false),
  reason: trimmed(),
  /** Срок в секундах; нет — null (навсегда), не целое от 1 с до 10 лет — NaN (400 в сервисе). */
  durationSec: raw().transform((v): number | null => {
    if (v == null) return null;
    return typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= MAX_BAN_SEC ? v : NaN;
  }),
});
export type BanDto = z.infer<typeof banSchema>;

export const labelUserSchema = requestBody({ label: raw().transform((v) => (v ? String(v) : "")) });
export type LabelUserDto = z.infer<typeof labelUserSchema>;

export const verifySchema = requestBody({ verified: raw().transform((v) => !!v) });
export type VerifyDto = z.infer<typeof verifySchema>;

export const developerSchema = requestBody({ developer: raw().transform((v) => !!v) });
export type DeveloperDto = z.infer<typeof developerSchema>;

export const reasonSchema = requestBody({ reason: reason() });
export type ReasonDto = z.infer<typeof reasonSchema>;

export const bulkDeleteSchema = requestBody({
  reason: reason(),
  items: raw().transform((v): unknown[] => (Array.isArray(v) ? v : [])),
});
export type BulkDeleteDto = z.infer<typeof bulkDeleteSchema>;

export const deleteUserSchema = requestBody({ confirm: confirm(), reason: reason() });
export type DeleteUserDto = z.infer<typeof deleteUserSchema>;

export const resetPasswordSchema = requestBody({
  confirm: confirm(),
  reason: reason(),
  password: text(),
  disableTwoFactor: raw().transform((v) => v === true),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const disableTwoFactorSchema = requestBody({ confirm: confirm(), reason: reason() });
export type DisableTwoFactorDto = z.infer<typeof disableTwoFactorSchema>;

/** Новая метка: id из id или короткой надписи; пустой id сервис заменит на сгенерированный. */
export const createLabelSchema = requestBody({ id: raw(), short: raw(), label: text(), hint: text(), color: raw() }).transform((b) => ({
  id: normalizeLabelId(b.id || b.short),
  short: String(b.short ?? "").trim().slice(0, 16).toUpperCase(),
  label: b.label.trim().slice(0, 60),
  hint: b.hint.trim().slice(0, 300),
  color: String(b.color ?? "#c6403b").trim().slice(0, 24),
}));
export type CreateLabelDto = z.infer<typeof createLabelSchema>;

/** Правка метки: только пришедшие поля (null — строка «null», как String(null) в server/). */
export const updateLabelSchema = requestBody({
  short: labelPatchField(16).transform((v) => v?.toUpperCase()),
  label: labelPatchField(60),
  hint: labelPatchField(300),
  color: labelPatchField(24),
});
export type UpdateLabelDto = z.infer<typeof updateLabelSchema>;

export const statusItemSchema = requestBody({ image: text(), name: trimmed() });
export type StatusItemDto = z.infer<typeof statusItemSchema>;

/** Разделы админки: только известные строки, остальное отбрасывается. */
export const sectionsSchema = requestBody({
  sections: raw().transform((v) => (Array.isArray(v) ? v : []).filter((s): s is string => typeof s === "string" && ADMIN_SECTIONS.includes(s))),
});
export type SectionsDto = z.infer<typeof sectionsSchema>;

/** Цены — объект как есть: его проверяет server/data/pricing.js. */
export const pricingSchema = z.unknown().transform((body): object => (body && typeof body === "object" ? body : {}));
export type PricingDto = z.infer<typeof pricingSchema>;
