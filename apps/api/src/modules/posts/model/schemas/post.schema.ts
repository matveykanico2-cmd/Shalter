import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля как пришли: в server/routes/posts.js их проверки идут после поиска канала и прав (404/403),
// а attachments, paidMedia и clientId разбирает общий код отправки сообщений.
export const publishPostSchema = requestBody({ text: raw(), attachments: raw(), paidMedia: raw(), clientId: raw() });
export type PublishPostDto = z.infer<typeof publishPostSchema>;
