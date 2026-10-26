import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { assertPublicUrl, isFcmConfigured, push } from "../../legacy/legacy.js";
import type { SubscribeDto, SubscribeNativeDto, UnsubscribeDto } from "./model/schemas/push.schema.js";
import { PushSubscriptionsRepository } from "./push-subscriptions.repository.js";

// Форму подписки проверила схема; здесь — только то, что требует запроса в DNS: публичный
// хост (та же проверка, что у превью ссылок) и https на стандартном порту.
async function isPublicHttpsEndpoint(endpoint: string): Promise<boolean> {
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
    if (!(await isPublicHttpsEndpoint(subscription.endpoint))) throw new ApiError(400, "invalid subscription");
    this.subscriptions.add(uid, subscription);
    return { ok: true };
  }

  // Android-приложение (Capacitor): токен устройства FCM. Хранится в той же таблице, что
  // и веб-подписки, — с endpoint «fcm:<токен>», так что вся отправка идёт через sendPushToUser.
  public subscribeNative(uid: string, { token, callUi }: SubscribeNativeDto) {
    this.subscriptions.add(uid, { endpoint: `fcm:${token}`, fcmToken: token, platform: "android", callUi });
    return { ok: true, configured: isFcmConfigured() };
  }

  // Только своя подписка: иначе, узнав чужой endpoint (или токен FCM), можно
  // отключить человеку уведомления.
  public unsubscribe(uid: string, { endpoint }: UnsubscribeDto) {
    if (endpoint) this.subscriptions.removeForUser(uid, endpoint);
    return { ok: true };
  }

  public endpoints(uid: string) {
    return { endpoints: this.subscriptions.listForUser(uid).map((s) => s.subscription?.endpoint).filter(Boolean) };
  }
}
