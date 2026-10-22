import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисах, как в server/routes/admin.js.
export const lookupQuerySchema = requestQuery({ q: raw() });
export type LookupQuery = z.infer<typeof lookupQuerySchema>;

export const directoryQuerySchema = requestQuery({ type: raw(), q: raw() });
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

export const exportSchema = requestBody({ userId: raw(), reason: raw() });
export type ExportDto = z.infer<typeof exportSchema>;

export const banSchema = requestBody({ banned: raw(), reason: raw(), durationSec: raw() });
export type BanDto = z.infer<typeof banSchema>;

export const labelUserSchema = requestBody({ label: raw() });
export type LabelUserDto = z.infer<typeof labelUserSchema>;

export const verifySchema = requestBody({ verified: raw() });
export type VerifyDto = z.infer<typeof verifySchema>;

export const developerSchema = requestBody({ developer: raw() });
export type DeveloperDto = z.infer<typeof developerSchema>;

export const reasonSchema = requestBody({ reason: raw() });
export type ReasonDto = z.infer<typeof reasonSchema>;

export const bulkDeleteSchema = requestBody({ reason: raw(), items: raw() });
export type BulkDeleteDto = z.infer<typeof bulkDeleteSchema>;

export const deleteUserSchema = requestBody({ confirm: raw(), reason: raw() });
export type DeleteUserDto = z.infer<typeof deleteUserSchema>;

export const resetPasswordSchema = requestBody({ confirm: raw(), reason: raw(), password: raw(), disableTwoFactor: raw() });
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const safetyLabelSchema = requestBody({ id: raw(), short: raw(), label: raw(), hint: raw(), color: raw() });
export type SafetyLabelDto = z.infer<typeof safetyLabelSchema>;

export const statusItemSchema = requestBody({ image: raw(), name: raw() });
export type StatusItemDto = z.infer<typeof statusItemSchema>;

export const sectionsSchema = requestBody({ sections: raw() });
export type SectionsDto = z.infer<typeof sectionsSchema>;

/** Цены — объект как есть: его проверяет server/data/pricing.js. */
export const pricingSchema = z.unknown().transform((body): object => (body && typeof body === "object" ? body : {}));
export type PricingDto = z.infer<typeof pricingSchema>;
