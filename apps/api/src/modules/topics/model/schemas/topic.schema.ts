import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

const MAX_TITLE = 64;

/** Один эмодзи (с модификаторами) — не больше 16 code units; иначе иконки нет. */
function cleanIcon(value: unknown): string | null {
  const icon = String(value ?? "").trim();
  return icon && icon.length <= 16 && !/[\w<>]/.test(icon) ? icon : null;
}

/** Поле правки: нет поля — undefined (не трогать), иначе значение после `fn`. */
const ifPresent = <T>(fn: (value: unknown) => T) => z.unknown().optional().transform((v) => (v === undefined ? undefined : fn(v)));

// Пустое название проверяет сервис: раньше него идут проверки группы и прав.

export const topicsEnabledSchema = requestBody({ enabled: z.unknown().optional().transform((v) => !!v) });
export type TopicsEnabledDto = z.infer<typeof topicsEnabledSchema>;

export const createTopicSchema = requestBody({
  title: z.unknown().optional().transform((v) => String(v ?? "").trim().slice(0, MAX_TITLE)),
  icon: z.unknown().optional().transform(cleanIcon),
  color: raw(),
});
export type CreateTopicDto = z.infer<typeof createTopicSchema>;

export const patchTopicSchema = requestBody({
  title: ifPresent((v) => String(v).trim().slice(0, MAX_TITLE)),
  icon: ifPresent(cleanIcon),
  color: raw(),
  closed: ifPresent((v) => !!v),
});
export type PatchTopicDto = z.infer<typeof patchTopicSchema>;
