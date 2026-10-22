// Модули с внешними сервисами: перевод (routes/translate.js), проверка ссылок
// и Instant View (routes/linkCheck.js, lib/linkPreview.js, lib/instantView.js),
// проверка орфографии «Хьюго» (routes/hugo.js, lib/languageTool.js),
// Shalter AI (routes/shalterAi.js, lib/aiPlans.js).
import { z } from "zod";

/** POST /api/translate */
export const translateBody = z.strictObject({ translated: z.string(), detectedLang: z.string().nullable() });

/** POST /api/translate/batch — null там, где перевести не вышло; "" остаётся "". */
export const translateBatchBody = z.strictObject({ translations: z.array(z.string().nullable()) });

/** GET /api/link-check — status есть, только если сайт ответил. */
export const linkCheckBody = z.strictObject({ frameable: z.boolean().nullable(), status: z.number().optional() });

export const ivBlock = z.union([
  z.strictObject({ type: z.literal("image"), url: z.string() }),
  z.strictObject({ type: z.enum(["heading", "quote", "item", "code", "caption", "text"]), text: z.string() }),
]);

/** GET /api/link-check/instant-view */
export const instantViewBody = z.strictObject({
  view: z.strictObject({
    url: z.string(),
    title: z.string(),
    siteName: z.string(),
    author: z.string(),
    publishedAt: z.string().nullable(),
    image: z.string().nullable(),
    blocks: z.array(ivBlock),
    unsafe: z.literal(true).optional(),
  }),
});

/** GET /api/hugo */
export const hugoInfoBody = z.strictObject({
  available: z.literal(true),
  languageTool: z.boolean(),
  selfHosted: z.boolean(),
  maxText: z.number(),
});

export const proofMatch = z.strictObject({
  offset: z.number(),
  length: z.number(),
  message: z.string(),
  short: z.string(),
  replacements: z.array(z.string()),
  type: z.string(),
});

/** POST /api/hugo/check — language нет только у пустого текста. */
export const hugoCheckBody = z.strictObject({ matches: z.array(proofMatch), language: z.string().nullable().optional() });

export const aiSettings = z.strictObject({
  mode: z.enum(["fast", "smart"]),
  length: z.enum(["short", "normal", "long"]),
  tone: z.enum(["friendly", "business", "fun", "simple"]),
  creativity: z.number().min(0).max(1),
  language: z.enum(["auto", "ru", "en"]),
  custom: z.string(),
});

export const aiPlan = z.strictObject({
  id: z.enum(["free", "premium"]),
  name: z.string(),
  textsPerDay: z.number(),
  imagesPerDay: z.number(),
  modes: z.array(z.enum(["fast", "smart"])),
  history: z.number(),
  perks: z.array(z.string()),
});

/** GET/PATCH /api/ai/settings */
export const aiStateBody = z.strictObject({
  settings: aiSettings,
  plan: aiPlan,
  plans: z.array(aiPlan),
  usage: z.strictObject({ texts: z.number(), images: z.number() }),
  choices: z.strictObject({
    mode: z.array(z.string()),
    length: z.array(z.string()),
    tone: z.array(z.string()),
    language: z.array(z.string()),
  }),
});

/** POST /api/ai/chat */
export const aiChatBody = z.strictObject({ chatId: z.string() });

/** POST /api/ai/stop */
export const aiStopBody = z.strictObject({ stopped: z.boolean() });
