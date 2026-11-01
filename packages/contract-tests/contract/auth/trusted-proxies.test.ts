// SHALTER_TRUSTED_PROXIES: адрес клиента за своим прокси Shalter (apps/proxy). Сервер всегда
// верит одному ближайшему прокси (в тестах — сам тест на 127.0.0.1, в бою — nginx), а
// адресам из списка — ещё на шаг дальше по X-Forwarded-For. Адрес виден в списке устройств.
import { describe, expect, test } from "vitest";
import { loginBody, sessionsBody } from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";

const server = useServer({ env: { SHALTER_TRUSTED_PROXIES: "10.9.8.7, 10.9.8.8" } });

async function locationVia(xff: string): Promise<string> {
  const { baseUrl } = server();
  const user = await registerUser(baseUrl);
  const api = new Api(baseUrl);
  const headers = { "x-forwarded-for": xff };
  expectOk(await api.post("/api/auth/login-email", { email: user.email, password: user.password }, { headers }), loginBody);
  const body = expectOk(await api.get("/api/sessions", { headers }), sessionsBody);
  return body.sessions.find((s) => s.current)!.location;
}

describe("SHALTER_TRUSTED_PROXIES", () => {
  test("за доверенным прокси адрес — клиента, которого дописал прокси", async () => {
    expect(await locationVia("203.0.113.7, 10.9.8.7")).toBe("203.0.113.7");
    expect(await locationVia("198.51.100.2, 10.9.8.8")).toBe("198.51.100.2");
  });

  test("чужой прокси адрес не подделает: виден он сам", async () => {
    expect(await locationVia("203.0.113.7, 10.0.0.1")).toBe("10.0.0.1");
  });

  test("без прокси — как раньше, один шаг", async () => {
    expect(await locationVia("192.0.2.44")).toBe("192.0.2.44");
  });
});
