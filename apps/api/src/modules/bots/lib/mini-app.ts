import { createHmac } from "node:crypto";

// Ссылка на мини-приложение бота с подписанными initData — как buildInitData, buildAppUrl,
// validateAppUrl и sameApp в server/lib/miniApp.js. Подпись проверяет Bot API в server/
// (verifyInitData), поэтому она обязана совпадать: mini-app.spec.ts падает при расхождении.

const SECRET_SALT = "ShalterWebAppData";

function signParams(params: URLSearchParams, token: string): string {
  const secretKey = createHmac("sha256", SECRET_SALT).update(token).digest();
  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

export interface InitDataUser {
  id: string;
  name: string;
  username?: string | null;
  isPremium?: boolean;
}

export function buildInitData({ token, user, chat, botUserId }: { token: string; user: InitDataUser; chat: { id: string } | null; botUserId: string }): string {
  const params = new URLSearchParams();
  params.set("user", JSON.stringify({ id: user.id, name: user.name, username: user.username || null, isPremium: !!user.isPremium }));
  if (chat?.id) params.set("chat_id", chat.id);
  params.set("bot_id", botUserId);
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("hash", signParams(params, token));
  return params.toString();
}

/** Адрес приложения: https (http — только localhost), без логина и пароля; пусто — без адреса. */
export function validateAppUrl(raw: unknown): { url: string | null; error?: undefined } | { error: string } {
  const value = String(raw ?? "").trim();
  if (!value) return { url: null };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { error: "Некорректный адрес приложения" };
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    return { error: "Адрес приложения должен начинаться с https:// (http — только для localhost)" };
  }
  if (u.username || u.password) return { error: "В адресе приложения не должно быть логина и пароля" };
  return { url: u.toString() };
}

export function sameApp(appUrl: string, requestedUrl: string): boolean {
  try {
    return new URL(appUrl).origin === new URL(requestedUrl).origin;
  } catch {
    return false;
  }
}

/** initData и тема — во фрагменте адреса: на сервер приложения они не уходят. */
export function buildAppUrl(url: string, initData: string, { theme }: { theme?: string } = {}): string {
  const u = new URL(url);
  const fragment = new URLSearchParams(u.hash.replace(/^#/, ""));
  fragment.set("shalterWebApp", initData);
  if (theme) fragment.set("shalterTheme", theme);
  u.hash = fragment.toString();
  return u.toString();
}
