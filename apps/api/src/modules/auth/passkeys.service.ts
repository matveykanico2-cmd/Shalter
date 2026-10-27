import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { parseUserAgent } from "../../common/lib/user-agent.js";
import { webauthn } from "../../legacy/legacy.js";
import { UsersRepository } from "../users/users.repository.js";
import { PasskeysRepository } from "./passkeys.repository.js";
import { SignInService, type LoginResult } from "./sign-in.service.js";
import { SystemNoticesService } from "./system-notices.service.js";

const MAX_PER_USER = 10;

// Ключи доступа (passkeys): вход без пароля и кода. Ключ с аккаунтом на устройстве
// пользователя, сервер хранит открытый ключ и проверяет подпись challenge.
@Injectable()
export class PasskeysService {
  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passkeysRepository: PasskeysRepository,
    private readonly signIn: SignInService,
    private readonly notices: SystemNoticesService
  ) {}

  public startRegistration(req: Request, userId: string) {
    const user = this.usersRepository.findById(userId);
    if (!user) throw new ApiError(404, "not found");
    const existing = this.passkeysRepository.list(user.id);
    if (existing.length >= MAX_PER_USER) throw new ApiError(400, `Не больше ${MAX_PER_USER} ключей`);
    const { rpId } = webauthn().rpFor(req);
    return {
      challenge: webauthn().newChallenge("register", user.id),
      rp: { id: rpId, name: "Shalter" },
      user: {
        id: webauthn().b64url(Buffer.from(user.id)),
        name: user.username || user.phone || user.email || user.name,
        displayName: user.name || "Shalter",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
      attestation: "none",
      timeout: 120000,
      excludeCredentials: existing.map((p) => ({ type: "public-key", id: p.id })),
    };
  }

  public async finishRegistration(req: Request, userId: string, body: Record<string, unknown>) {
    const { rpId, origin } = webauthn().rpFor(req);
    let result;
    try {
      result = webauthn().verifyRegistration(body, { origin, rpId, userId });
    } catch (err) {
      throw new ApiError(400, `Не удалось добавить ключ: ${(err as Error).message}`);
    }
    const name = String(body.name ?? "").trim().slice(0, 60) || parseUserAgent(req.headers["user-agent"]);
    const added = this.passkeysRepository.add({ id: result.credentialId, userId, publicKey: result.publicKey, signCount: result.signCount, name });
    if (!added) throw new ApiError(409, "Этот ключ уже добавлен");
    await this.notices.notify(
      userId,
      `🔑 К аккаунту добавлен ключ доступа «${added.name}». Если это были не вы — удалите его в Настройки → Конфиденциальность и завершите чужие сеансы.`,
      "passkey notice"
    );
    return { passkey: { id: added.id, name: added.name, createdAt: added.createdAt } };
  }

  public list(userId: string) {
    return { passkeys: this.passkeysRepository.list(userId).map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt })) };
  }

  public delete(userId: string, id: string): void {
    if (!this.passkeysRepository.delete(userId, id)) throw new ApiError(404, "Ключ не найден");
  }

  public startLogin(req: Request) {
    const { rpId } = webauthn().rpFor(req);
    return { challenge: webauthn().newChallenge("login"), rpId, userVerification: "preferred", timeout: 120000 };
  }

  public async finishLogin(req: Request, res: Response, body: Record<string, unknown>): Promise<LoginResult> {
    const passkey = typeof body.id === "string" ? this.passkeysRepository.get(body.id) : undefined;
    if (!passkey) throw new ApiError(401, "Этот ключ не привязан ни к одному аккаунту");
    const { rpId, origin } = webauthn().rpFor(req);
    let signCount: number;
    try {
      ({ signCount } = webauthn().verifyAssertion(body, { origin, rpId, passkey }));
    } catch (err) {
      throw new ApiError(401, `Вход по ключу не удался: ${(err as Error).message}`);
    }
    this.passkeysRepository.touch(passkey.id, signCount);
    const user = this.usersRepository.findById(passkey.userId);
    if (!user) throw new ApiError(401, "Аккаунт не найден");
    return this.signIn.finishLogin(req, res, user);
  }
}
