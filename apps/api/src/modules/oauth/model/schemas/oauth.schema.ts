import { z } from "zod";
import { raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/oauth.js.
export const tokenSchema = requestBody({ client_id: raw(), client_secret: raw(), code: raw(), redirect_uri: raw() });
export type TokenDto = z.infer<typeof tokenSchema>;

export const appInfoQuerySchema = requestQuery({ client_id: raw(), redirect_uri: raw() });
export type AppInfoQueryDto = z.infer<typeof appInfoQuerySchema>;

export const authorizeSchema = requestBody({ client_id: raw(), redirect_uri: raw(), state: raw() });
export type AuthorizeDto = z.infer<typeof authorizeSchema>;

export const createAppSchema = requestBody({ name: text(), redirectUri: text() });
export type CreateAppDto = z.infer<typeof createAppSchema>;
