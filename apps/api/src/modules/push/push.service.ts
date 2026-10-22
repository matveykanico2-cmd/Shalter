import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { assertPublicUrl, isFcmConfigured, push } from "../../legacy/legacy.js";
import type { SubscribeDto, SubscribeNativeDto, UnsubscribeDto } from "./model/schemas/push.schema.js";
import { PushSubscriptionsRepository } from "./push-subscriptions.repository.js";

interface WebSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  [key: string]: unknown;
}

// Сервер сам POST'ит на endpoint подписки, поэтому произвольный адрес — это SSRF
// (запрос на 127.0.0.1, во внутреннюю сеть, к метаданным облака). Принимаем только
// то, что выдаёт браузерный PushManager: https на стандартном порту, публичный
// хост (та же проверка, что у превью ссылок), и ключи шифрования p256dh/auth.
async function isValidWebSubscription(subscription: unknown): Promise<boolean> {
  if (!subscription || typeof subscription !== "object") return false;
  const { endpoint, keys } = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 2048) return false;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || !keys.p256dh || !keys.auth) return false;
  if (keys.p256dh.length > 256 || keys.auth.length > 256) return false;
  try {
    const url = await assertPublicUrl(endpoint);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

// Подписки на уведомления: веб (Push API) и Android (FCM) — как server/routes/push.js.
@Injectable()
export class PushService {
  public constructor(private readonly subscriptions: PushSubscriptionsRepository) {}

  public publicKey() {
    return { publicKey: push().getPublicKey() };
  }

  public async subscribe(uid: string, { subscription }: SubscribeDto) {
    if (!(await isValidWebSubscription(subscription))) throw new ApiError(400, "invalid subscription");
    this.subscriptions.add(uid, subscription as WebSubscription);
    return { ok: true };
  }

  // Android-приложение (Capacitor): токен устройства FCM. Хранится в той же таблице, что
  // и веб-подписки, — с endpoint «fcm:<токен>», так что вся отправка идёт через sendPushToUser.
  public subscribeNative(uid: string, body: SubscribeNativeDto) {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 4096) throw new ApiError(400, "invalid token");
    this.subscriptions.add(uid, { endpoint: `fcm:${token}`, fcmToken: token, platform: "android", callUi: body.callUi === true });
    return { ok: true, configured: isFcmConfigured() };
  }

  // Только своя подписка: иначе, узнав чужой endpoint (или токен FCM), можно
  // отключить человеку уведомления.
  public unsubscribe(uid: string, { endpoint }: UnsubscribeDto) {
    if (typeof endpoint === "string" && endpoint) this.subscriptions.removeForUser(uid, endpoint);
    return { ok: true };
  }

  public endpoints(uid: string) {
    return { endpoints: this.subscriptions.listForUser(uid).map((s) => s.subscription?.endpoint).filter(Boolean) };
  }
}
