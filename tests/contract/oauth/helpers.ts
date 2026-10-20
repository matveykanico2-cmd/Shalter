// Общие помощники тестов OAuth-провайдера (/api/oauth).
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import type { TestUser } from "../../support/seed";
import { appBody, authorizeBody, oauthAppWithSecret } from "../../schemas/oauth";
import type { z } from "zod";

export const APP_NOT_FOUND = "Приложение не найдено";
export const APP_OR_REDIRECT = "Приложение не найдено или redirect_uri не совпадает";
export const NEED_NAME = "Укажите название приложения";
export const BAD_URL = "redirect_uri должен быть полным адресом (https://...)";
export const NEED_HTTPS = "redirect_uri должен быть https:// (кроме localhost для разработки)";

export type OAuthApp = z.infer<typeof oauthAppWithSecret>;

/** Регистрация приложения через POST /api/oauth/apps. */
export async function createApp(owner: TestUser, extra: Record<string, unknown> = {}): Promise<OAuthApp> {
  return expectOk(await owner.api.post("/api/oauth/apps", { name: "Моё приложение", redirectUri: "https://app.example/cb", ...extra }), appBody).app;
}

/** Пользователь разрешает доступ — POST /authorize, возвращает code из redirectUrl. */
export async function authorize(user: TestUser, app: OAuthApp, state?: string): Promise<{ code: string; redirectUrl: string }> {
  const body = expectOk(await user.api.post("/api/oauth/authorize", { client_id: app.clientId, redirect_uri: app.redirectUri, state }), authorizeBody);
  const code = new URL(body.redirectUrl).searchParams.get("code");
  if (!code) throw new Error(`в redirectUrl нет code: ${body.redirectUrl}`);
  return { code, redirectUrl: body.redirectUrl };
}

/** Сервер стороннего приложения: без cookie, только тело запроса. */
export function exchange(baseUrl: string, body: Record<string, unknown>) {
  return new Api(baseUrl).post("/api/oauth/token", body);
}

export function userinfo(baseUrl: string, authorization?: string) {
  return new Api(baseUrl).get("/api/oauth/userinfo", { headers: authorization === undefined ? {} : { authorization } });
}
