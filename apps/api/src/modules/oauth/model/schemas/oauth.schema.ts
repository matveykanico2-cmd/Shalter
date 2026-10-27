import { z } from "zod";
import { requestBody, requestQuery, text } from "../../../../common/lib/zod.js";
import { isAllowedRedirectUri } from "../../lib/oauth.js";

// Как server/routes/oauth.js. Ошибки обмена и согласия зависят от приложения в базе, их
// отдаёт сервис; схема только приводит поля.

/** client_id: пустой (ложный) — undefined, приложение тогда не ищется. */
const clientId = () =>
  z
    .unknown()
    .optional()
    .transform((v) => (v ? String(v) : undefined));

/** redirect_uri сравнивается с адресом приложения через ===: не строка не совпадёт ни с чем. */
const redirectUri = () =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v : undefined));

export const tokenSchema = requestBody({ client_id: clientId(), client_secret: text(), code: text(), redirect_uri: text() });
export type TokenDto = z.infer<typeof tokenSchema>;

export const appInfoQuerySchema = requestQuery({ client_id: text(), redirect_uri: redirectUri() });
export type AppInfoQueryDto = z.infer<typeof appInfoQuerySchema>;

export const authorizeSchema = requestBody({ client_id: clientId(), redirect_uri: redirectUri(), state: clientId() });
export type AuthorizeDto = z.infer<typeof authorizeSchema>;

const trimmed = () =>
  z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim());

export const createAppSchema = requestBody({
  name: trimmed().refine((name) => name.length > 0, { error: "Укажите название приложения" }),
  redirectUri: trimmed()
    .refine(
      (uri) => {
        try {
          new URL(uri);
          return true;
        } catch {
          return false;
        }
      },
      { error: "redirect_uri должен быть полным адресом (https://...)" }
    )
    .refine(isAllowedRedirectUri, { error: "redirect_uri должен быть https:// (кроме localhost для разработки)" }),
});
export type CreateAppDto = z.infer<typeof createAppSchema>;
