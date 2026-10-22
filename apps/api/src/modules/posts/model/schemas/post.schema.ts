import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/posts.js.
export const publishPostSchema = requestBody({ text: raw(), attachments: raw(), paidMedia: raw(), clientId: raw() });
export type PublishPostDto = z.infer<typeof publishPostSchema>;
