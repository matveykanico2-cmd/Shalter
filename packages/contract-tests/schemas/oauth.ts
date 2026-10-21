// OAuth-провайдер для сторонних приложений: routes/oauth.js, data/oauthApps.js.
import { z } from "zod";
import { isoDate } from "./common";

const hex = (bytes: number) => z.string().regex(new RegExp(`^[0-9a-f]{${bytes * 2}}$`));

/** id приложения: oa_<время base36>_<8 hex> — не genId. */
export const oauthAppId = z.string().regex(/^oa_[0-9a-z]+_[0-9a-f]{8}$/);
export const clientId = hex(12);
export const clientSecret = hex(24);
export const authCode = hex(24);
export const accessToken = hex(32);

/** rowToApp — без секрета (список приложений). */
export const oauthApp = z.strictObject({
  id: oauthAppId,
  name: z.string(),
  clientId,
  redirectUri: z.string(),
  ownerId: z.string(),
  createdAt: isoDate,
});

/** Только что созданное / с новым секретом — секрет в ответе. */
export const oauthAppWithSecret = oauthApp.extend({ clientSecret });

export const appBody = z.strictObject({ app: oauthAppWithSecret });
export const appsBody = z.strictObject({ apps: z.array(oauthApp) });
export const secretBody = z.strictObject({ clientId, clientSecret });
export const appInfoBody = z.strictObject({ name: z.string() });
export const authorizeBody = z.strictObject({ redirectUrl: z.string() });

/** publicProfile — что видит стороннее приложение. */
export const oauthProfile = z.strictObject({
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  avatarImage: z.string().nullable(),
});

export const tokenBody = z.strictObject({ access_token: accessToken, token_type: z.literal("bearer"), user: oauthProfile });

/** Ошибки OAuth — машинные коды, а не тексты. */
export const oauthError = z.strictObject({ error: z.enum(["invalid_client", "invalid_grant", "invalid_token"]) });
