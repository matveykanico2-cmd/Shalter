import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

/**
 * POST /api/test/sweeps/:name — now: момент, от которого обход считает сроки (по умолчанию сейчас).
 * Неверное время схема не отклоняет: «Нет такого обхода» (404) проверяется раньше, в сервисе.
 */
export const testSweepSchema = requestBody({
  now: z.unknown().optional().transform((v) => (v === undefined ? new Date() : new Date(v as string | number))),
});
export type TestSweepDto = z.infer<typeof testSweepSchema>;
