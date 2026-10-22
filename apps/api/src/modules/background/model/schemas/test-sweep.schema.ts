import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

/** POST /api/test/sweeps/:name — now: момент, от которого обход считает сроки (по умолчанию сейчас). */
export const testSweepSchema = requestBody({ now: raw() });
export type TestSweepDto = z.infer<typeof testSweepSchema>;
