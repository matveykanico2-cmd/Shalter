import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { UsersRepository } from "../users/users.repository.js";
import { isAllowedRedirectUri, oauthProfile, sameSecret } from "./lib/oauth.js";
import type { AppInfoQueryDto, AuthorizeDto, CreateAppDto, TokenDto } from "./model/schemas/oauth.schema.js";
import { OAuthRepository } from "./oauth.repository.js";

// «Вход через Shalter» для сторонних сайтов: обмен кода, профиль по токену, экран согласия и
// приложения разработчика — как server/routes/oauth.js.
const NOT_FOUND = "Приложение не найдено или redirect_uri не совпадает";

@Injectable()
export class OAuthService {
  public constructor(
    private readonly oauth: OAuthRepository,
    private readonly users: UsersRepository
  ) {}

  /** Ошибки — в виде OAuth (invalid_client, invalid_grant). */
  public token(dto: TokenDto) {
    const { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri } = dto;
    const app = clientId ? this.oauth.findByClientId(String(clientId)) : undefined;
    if (!app || !sameSecret(app.clientSecret, clientSecret)) throw new ApiError(401, "invalid_client");
    if (!isAllowedRedirectUri(app.redirectUri)) throw new ApiError(400, "invalid_grant");
    const redeemed = this.oauth.redeemCode(String(code ?? ""), app.clientId, String(redirectUri ?? ""));
    if (!redeemed) throw new ApiError(400, "invalid_grant");

    const user = this.users.findById(redeemed.userId);
    if (!user) throw new ApiError(400, "invalid_grant");
    const accessToken = this.oauth.issueToken(app.clientId, user.id);
    return { access_token: accessToken, token_type: "bearer", user: oauthProfile(user) };
  }

  public userinfo(authorization: string | undefined) {
    const auth = authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const owner = token ? this.oauth.tokenOwner(token) : undefined;
    if (!owner) throw new ApiError(401, "invalid_token");
    const user = this.users.findById(owner.userId);
    if (!user) throw new ApiError(401, "invalid_token");
    return oauthProfile(user);
  }

  /**
   * Экран согласия открывают и гости: им показывается название приложения и форма входа. Только
   * имя и только при точном совпадении client_id и redirect_uri.
   */
  public appInfo(query: AppInfoQueryDto) {
    const app = this.oauth.findByClientId(String(query.client_id ?? ""));
    if (!app || app.redirectUri !== query.redirect_uri || !isAllowedRedirectUri(app.redirectUri)) throw new ApiError(404, NOT_FOUND);
    return { name: app.name };
  }

  public authorize(uid: string, dto: AuthorizeDto) {
    const { client_id: clientId, redirect_uri: redirectUri, state } = dto;
    const app = clientId ? this.oauth.findByClientId(String(clientId)) : undefined;
    if (!app || app.redirectUri !== redirectUri || !isAllowedRedirectUri(app.redirectUri)) throw new ApiError(404, NOT_FOUND);
    const code = this.oauth.createCode(app.clientId, uid, String(redirectUri));
    const url = new URL(String(redirectUri));
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", String(state));
    return { redirectUrl: url.toString() };
  }

  public listApps(uid: string) {
    return { apps: this.oauth.listByOwner(uid) };
  }

  public createApp(uid: string, dto: CreateAppDto) {
    const name = dto.name.trim();
    const redirectUri = dto.redirectUri.trim();
    if (!name) throw new ApiError(400, "Укажите название приложения");
    try {
      new URL(redirectUri);
    } catch {
      throw new ApiError(400, "redirect_uri должен быть полным адресом (https://...)");
    }
    if (!isAllowedRedirectUri(redirectUri)) throw new ApiError(400, "redirect_uri должен быть https:// (кроме localhost для разработки)");
    return { app: this.oauth.createApp(uid, name, redirectUri) };
  }

  public deleteApp(uid: string, id: string) {
    if (!this.oauth.deleteApp(id, uid)) throw new ApiError(404, "Приложение не найдено");
    return { ok: true };
  }

  public secret(uid: string, id: string) {
    const creds = this.oauth.secretOf(id, uid);
    if (!creds) throw new ApiError(404, "Приложение не найдено");
    return creds;
  }

  public regenerate(uid: string, id: string) {
    const app = this.oauth.regenerateSecret(id, uid);
    if (!app) throw new ApiError(404, "Приложение не найдено");
    return { app };
  }
}
