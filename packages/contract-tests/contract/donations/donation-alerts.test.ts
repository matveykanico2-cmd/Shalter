// Подключение DonationAlerts (OAuth): статус, переход на авторизацию и возврат
// с кодом. Обмен кода на токены — запрос к www.donationalerts.com; чтобы тест
// не ходил в интернет, сервер запускается с NODE_USE_ENV_PROXY=1 и HTTPS_PROXY на
// локальную заглушку, которая отвечает отказом на любой CONNECT.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { donationStatusBody } from "../../schemas/donations";
import { expectOk } from "../../support/expect";
import { registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { adminEnv, expectAll401, registerAdmin } from "../stars/helpers";

const ADMIN_PHONE = "+70000000914";
const REDIRECT_URI = "http://127.0.0.1:9/api/donation-alerts/callback";

// Заглушка-прокси: запоминает, куда сервер пытался выйти, и отказывает.
const proxied: string[] = [];
const proxy = http.createServer((req, res) => {
  proxied.push(`${req.method} ${req.url}`);
  res.writeHead(502).end();
});
proxy.on("connect", (req, socket) => {
  proxied.push(`CONNECT ${req.url}`);
  socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
});

// env заполняется до старта сервера: beforeAll ниже зарегистрирован раньше useServer.
const env: Record<string, string> = {
  ...adminEnv(ADMIN_PHONE),
  DONATIONALERTS_CLIENT_ID: "test-client",
  DONATIONALERTS_CLIENT_SECRET: "test-secret",
  DONATIONALERTS_REDIRECT_URI: REDIRECT_URI,
  NODE_USE_ENV_PROXY: "1",
};
beforeAll(async () => {
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  Object.assign(env, { HTTPS_PROXY: url, HTTP_PROXY: url, https_proxy: url, http_proxy: url });
});
afterAll(async () => {
  await new Promise((resolve) => proxy.close(resolve));
});
const server = useServer({ env });

let adminUser: TestUser;
async function admin(): Promise<TestUser> {
  adminUser ??= await registerAdmin(server().baseUrl, ADMIN_PHONE);
  return adminUser;
}

test("без сессии — 401", async () => {
  await expectAll401(server().baseUrl, [
    ["GET", "/api/donation-alerts/status"],
    ["GET", "/api/donation-alerts/connect"],
    ["GET", "/api/donation-alerts/callback?code=x"],
  ]);
});

describe("права", () => {
  test("без раздела «donations» — 403: status JSON-ом, connect/callback текстом", async () => {
    const [user] = await registerUsers(server().baseUrl, 1);
    const status = await user.api.get("/api/donation-alerts/status");
    expect(status.status).toBe(403);
    expect(status.body).toEqual({ error: "Недостаточно прав" });
    for (const path of ["/api/donation-alerts/connect", "/api/donation-alerts/callback?code=x"]) {
      const res = await user.api.get(path);
      expect(res.status).toBe(403);
      expect(res.text).toBe("Недостаточно прав");
    }
    expect(proxied).toEqual([]);
  });

  test("раздел «donations», выданный главным админом, открывает статус", async () => {
    const adm = await admin();
    const [user] = await registerUsers(server().baseUrl, 1);
    const grant = await adm.api.post(`/api/admin/users/${user.id}/admin-sections`, { sections: ["donations"] });
    expect(grant.status, grant.text).toBe(200);
    expect(expectOk(await user.api.get("/api/donation-alerts/status"), donationStatusBody).configured).toBe(true);
    // Другой раздел — не тот.
    await adm.api.post(`/api/admin/users/${user.id}/admin-sections`, { sections: ["giftshop"] });
    expect((await user.api.get("/api/donation-alerts/status")).status).toBe(403);
  });
});

describe("OAuth", () => {
  test("status: настроен, не подключён", async () => {
    const adm = await admin();
    expect(expectOk(await adm.api.get("/api/donation-alerts/status"), donationStatusBody)).toEqual({
      configured: true,
      connected: false,
      username: null,
      donatePayConfigured: false,
    });
  });

  test("connect — 302 на страницу авторизации DonationAlerts с client_id и redirect_uri", async () => {
    const adm = await admin();
    const res = await adm.api.get("/api/donation-alerts/connect");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("https://www.donationalerts.com/oauth/authorize");
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: "test-client",
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "oauth-donation-index oauth-user-show",
    });
    expect(proxied).toEqual([]);
  });

  test("callback без кода или с error — 302 на настройки с error=1, наружу не ходит", async () => {
    const adm = await admin();
    for (const path of ["/api/donation-alerts/callback", "/api/donation-alerts/callback?error=access_denied", "/api/donation-alerts/callback?code=x&error=1"]) {
      const res = await adm.api.get(path);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/settings/donations?error=1");
    }
    expect(proxied).toEqual([]);
  });

  test("callback с кодом: обмен на токены не удался — 302 с error=1, подключения нет", async () => {
    const adm = await admin();
    const res = await adm.api.get("/api/donation-alerts/callback?code=abc");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings/donations?error=1");
    // Запрос ушёл в заглушку, а не в интернет.
    expect(proxied).toEqual(["CONNECT www.donationalerts.com:443"]);
    expect(expectOk(await adm.api.get("/api/donation-alerts/status"), donationStatusBody).connected).toBe(false);
  });
});
