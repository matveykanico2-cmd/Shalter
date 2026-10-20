// Push-подписки (/api/push): ключ VAPID, веб-подписка, токен FCM, отписка, список
// endpoint'ов — и доставка: новое сообщение уходит POST-запросом на endpoint
// подписки (здесь — локальная HTTPS-заглушка за CONNECT-прокси на «публичном»
// адресе PUSH_HOST), тело шифруется ключами подписки.
import { describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { endpointsBody, messagePushPayload, nativeSubscribeBody, vapidKeyBody } from "../../schemas/push";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers, sendText, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { expectAll401 } from "../stars/helpers";
import { browserSubscription } from "./helpers";
import { PUSH_HOST, useTlsEgress, type TlsHit } from "./tls";

// Endpoint'ы во внутренней сети сервер не принимает (SSRF), поэтому «push-сервис» —
// публичный по мнению сервера адрес, а прокси заворачивает его в локальную заглушку.
const env: Record<string, string> = {};
const { site } = useTlsEgress(env, [PUSH_HOST]);
const server = useServer({ env });

/** Endpoint, который никуда не ведёт (прокси на такой адрес отвечает 502) — для подписок без доставки. */
const deadEndpoint = () => `https://203.0.113.9/push/${uniq("ep")}`;
/** Подписка в форме браузерной (с ключами) на мёртвый endpoint. */
const deadSubscription = (endpoint = deadEndpoint()) => browserSubscription(endpoint).json;

async function endpointsOf(user: TestUser): Promise<string[]> {
  return expectOk(await user.api.get("/api/push/endpoints"), endpointsBody).endpoints;
}

async function subscribe(user: TestUser, subscription: unknown) {
  expectOk(await user.api.post("/api/push/subscribe", { subscription }), okBody);
}

/** Ждёт условие с запасом: машина может быть нагружена параллельными прогонами. */
async function until<T>(get: () => T | Promise<T>, what: string, timeoutMs = 10_000): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await get();
    if (v) return v as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`не дождались: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Endpoint на заглушке; ответ push-сервиса — status. */
function stubEndpoint(status = 201): { url: string; hits: () => TlsHit[] } {
  const p = `/push/${uniq("ep")}`;
  site().routes.set(`${PUSH_HOST}${p}`, (_hit, res) => {
    res.statusCode = status;
    res.end();
  });
  return { url: `https://${PUSH_HOST}${p}`, hits: () => site().hits.filter((h) => h.path === p) };
}

describe("без сессии", () => {
  test("подписка, отписка и список endpoint'ов — 401 unauthorized", async () => {
    await expectAll401(server().baseUrl, [
      ["POST", "/api/push/subscribe"],
      ["POST", "/api/push/subscribe-native"],
      ["POST", "/api/push/unsubscribe"],
      ["GET", "/api/push/endpoints"],
    ]);
  });

  test("GET /vapid-public-key доступен без входа и не меняется между запросами", async () => {
    const { baseUrl } = server();
    const first = expectOk(await new Api(baseUrl).get("/api/push/vapid-public-key"), vapidKeyBody);
    const user = await registerUser(baseUrl);
    const second = expectOk(await user.api.get("/api/push/vapid-public-key"), vapidKeyBody);
    expect(second.publicKey).toBe(first.publicKey);
    // Ключ — несжатая точка P-256: 65 байт, первый 0x04.
    const raw = Buffer.from(first.publicKey, "base64url");
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(4);
  });
});

describe("POST /api/push/subscribe", () => {
  test("без subscription.endpoint — 400 invalid subscription", async () => {
    const user = await registerUser(server().baseUrl);
    for (const body of [{}, { subscription: null }, { subscription: {} }, { subscription: "x" }, { subscription: { endpoint: "" } }, { endpoint: deadEndpoint() }]) {
      expectError(await user.api.post("/api/push/subscribe", body), 400, "invalid subscription");
    }
    expect(await endpointsOf(user)).toEqual([]);
  });

  test("подписка появляется в /endpoints; повтор того же endpoint не дублирует", async () => {
    const user = await registerUser(server().baseUrl);
    expect(await endpointsOf(user)).toEqual([]);
    const a = browserSubscription(deadEndpoint()).json;
    const b = browserSubscription(deadEndpoint()).json;
    await subscribe(user, a);
    await subscribe(user, b);
    await subscribe(user, a);
    expect((await endpointsOf(user)).sort()).toEqual([a.endpoint, b.endpoint].sort());
  });

  test("тот же endpoint с другого аккаунта переходит к нему (одно устройство — один владелец)", async () => {
    const [first, second] = await registerUsers(server().baseUrl, 2);
    const sub = deadSubscription();
    await subscribe(first, sub);
    await subscribe(second, sub);
    expect(await endpointsOf(first)).toEqual([]);
    expect(await endpointsOf(second)).toEqual([sub.endpoint]);
  });

  test("endpoint — только https на публичный хост и с ключами p256dh/auth (иначе SSRF)", async () => {
    const user = await registerUser(server().baseUrl);
    const keys = deadSubscription().keys;
    const bad = [
      { endpoint: "not-a-url", keys },
      { endpoint: `http://${PUSH_HOST}/push/x`, keys },
      { endpoint: `https://${PUSH_HOST}:8443/push/x`, keys },
      { endpoint: "https://127.0.0.1/push/x", keys },
      { endpoint: "https://10.0.0.5/push/x", keys },
      { endpoint: "https://169.254.169.254/latest/meta-data", keys },
      { endpoint: "https://[::1]/push/x", keys },
      { endpoint: "javascript:alert(1)", keys },
      { endpoint: deadEndpoint() },
      { endpoint: deadEndpoint(), keys: {} },
      { endpoint: deadEndpoint(), keys: { p256dh: keys.p256dh } },
      { endpoint: deadEndpoint(), keys: { p256dh: 1, auth: 2 } },
      { endpoint: `https://${PUSH_HOST}/${"x".repeat(2048)}`, keys },
    ];
    for (const subscription of bad) {
      expectError(await user.api.post("/api/push/subscribe", { subscription }), 400, "invalid subscription");
    }
    expect(await endpointsOf(user)).toEqual([]);
  });
});

describe("POST /api/push/subscribe-native", () => {
  test("токен FCM: пустой, не строка или длиннее 4096 — 400 invalid token", async () => {
    const user = await registerUser(server().baseUrl);
    for (const body of [{}, { token: "" }, { token: "   " }, { token: 123 }, { token: ["t"] }, { token: "x".repeat(4097) }]) {
      expectError(await user.api.post("/api/push/subscribe-native", body), 400, "invalid token");
    }
    expect(await endpointsOf(user)).toEqual([]);
  });

  test("токен обрезается и хранится как endpoint «fcm:<токен>»; configured=false без сервисного аккаунта", async () => {
    const user = await registerUser(server().baseUrl);
    const token = uniq("fcm");
    const body = expectOk(await user.api.post("/api/push/subscribe-native", { token: `  ${token}  `, callUi: true }), nativeSubscribeBody);
    expect(body).toEqual({ ok: true, configured: false });
    const long = "y".repeat(4096);
    expectOk(await user.api.post("/api/push/subscribe-native", { token: long }), nativeSubscribeBody);
    expect((await endpointsOf(user)).sort()).toEqual([`fcm:${token}`, `fcm:${long}`].sort());
  });
});

describe("POST /api/push/unsubscribe", () => {
  test("удаляет подписку по endpoint; без endpoint или с неизвестным — просто ok", async () => {
    const user = await registerUser(server().baseUrl);
    const keep = deadEndpoint();
    const drop = deadEndpoint();
    await subscribe(user, deadSubscription(keep));
    await subscribe(user, deadSubscription(drop));
    expectOk(await user.api.post("/api/push/unsubscribe", {}), okBody);
    expectOk(await user.api.post("/api/push/unsubscribe", { endpoint: deadEndpoint() }), okBody);
    expect((await endpointsOf(user)).sort()).toEqual([keep, drop].sort());
    expectOk(await user.api.post("/api/push/unsubscribe", { endpoint: drop }), okBody);
    expect(await endpointsOf(user)).toEqual([keep]);
  });

  test("токен FCM отписывается тем же маршрутом по «fcm:<токен>»", async () => {
    const user = await registerUser(server().baseUrl);
    const token = uniq("fcm");
    expectOk(await user.api.post("/api/push/subscribe-native", { token }), nativeSubscribeBody);
    expectOk(await user.api.post("/api/push/unsubscribe", { endpoint: `fcm:${token}` }), okBody);
    expect(await endpointsOf(user)).toEqual([]);
  });

  test("чужую подписку удалить нельзя: ok, но подписка владельца остаётся", async () => {
    const [owner, stranger] = await registerUsers(server().baseUrl, 2);
    const ep = deadEndpoint();
    await subscribe(owner, deadSubscription(ep));
    const token = uniq("fcm");
    expectOk(await owner.api.post("/api/push/subscribe-native", { token }), nativeSubscribeBody);
    expectOk(await stranger.api.post("/api/push/unsubscribe", { endpoint: ep }), okBody);
    expectOk(await stranger.api.post("/api/push/unsubscribe", { endpoint: `fcm:${token}` }), okBody);
    expect((await endpointsOf(owner)).sort()).toEqual([ep, `fcm:${token}`].sort());
  });
});

describe("доставка веб-пуша", () => {
  test("новое сообщение: зашифрованный пуш получателю, не отправителю и не постороннему", async () => {
    const { baseUrl } = server();
    const [sender, recipient, outsider] = await registerUsers(baseUrl, 3);
    const { publicKey } = expectOk(await new Api(baseUrl).get("/api/push/vapid-public-key"), vapidKeyBody);
    const toRecipient = stubEndpoint();
    const toSender = stubEndpoint();
    const toOutsider = stubEndpoint();
    const sub = browserSubscription(toRecipient.url);
    await subscribe(recipient, sub.json);
    await subscribe(sender, browserSubscription(toSender.url).json);
    await subscribe(outsider, browserSubscription(toOutsider.url).json);

    const chat = await createDm(sender, recipient);
    const message = await sendText(sender, chat.id, "Привет из теста пушей");
    const [hit] = await until(() => (toRecipient.hits().length ? toRecipient.hits() : null), "пуш получателю");

    expect(hit.method).toBe("POST");
    expect(hit.headers).toMatchObject({ ttl: "86400", urgency: "high", "content-encoding": "aes128gcm" });
    expect(hit.headers.authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${publicKey}$`));
    const payload = expectShape(messagePushPayload, JSON.parse(sub.decrypt(hit.body)), "содержимое пуша");
    expect(payload).toEqual({
      title: sender.name,
      body: "Привет из теста пушей",
      avatar: { url: null, color: expect.any(String), name: sender.name },
      url: `/chat/${chat.id}`,
      kind: "message",
      tag: `chat-${chat.id}`,
      chatId: chat.id,
      messageId: message.id,
    });

    await new Promise((r) => setTimeout(r, 400));
    expect(toSender.hits()).toEqual([]);
    expect(toOutsider.hits()).toEqual([]);
    expect(toRecipient.hits()).toHaveLength(1);
  });

  test("«без звука» (silent: true) — в пуше silent: true", async () => {
    const [sender, recipient] = await registerUsers(server().baseUrl, 2);
    const ep = stubEndpoint();
    const sub = browserSubscription(ep.url);
    await subscribe(recipient, sub.json);
    const chat = await createDm(sender, recipient);
    await sendText(sender, chat.id, "тихо", { silent: true });
    const [hit] = await until(() => (ep.hits().length ? ep.hits() : null), "тихий пуш");
    const payload = expectShape(messagePushPayload, JSON.parse(sub.decrypt(hit.body)), "содержимое пуша");
    expect(payload).toMatchObject({ body: "тихо", silent: true });
  });

  test("push-сервис ответил 410 Gone — подписка удаляется, 500 — остаётся", async () => {
    const [sender, recipient] = await registerUsers(server().baseUrl, 2);
    const gone = stubEndpoint(410);
    const broken = stubEndpoint(500);
    await subscribe(recipient, browserSubscription(gone.url).json);
    await subscribe(recipient, browserSubscription(broken.url).json);
    const chat = await createDm(sender, recipient);
    await sendText(sender, chat.id, "кому-нибудь");
    await until(() => gone.hits().length && broken.hits().length, "запросы на оба endpoint'а");
    await until(async () => {
      const eps = await endpointsOf(recipient);
      return eps.length === 1 && eps[0] === broken.url;
    }, "удаление подписки после 410");
  });
});
