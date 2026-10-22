import type { oauthApps } from "../../db/schema.js";

/** Строка oauth_apps как есть, с секретом — только для проверок на сервере. */
export type OAuthAppRow = typeof oauthApps.$inferSelect;

/** Приложение в ответах API — без секрета (rowToApp в server/data/oauthApps.js). */
export interface OAuthApp {
  id: string;
  name: string;
  clientId: string;
  redirectUri: string;
  ownerId: string;
  createdAt: string;
}
