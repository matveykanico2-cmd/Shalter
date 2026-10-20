// GET /api/admin/mail-status при настроенном, но недоступном SMTP: ошибка
// проверки соединения видна админу. SMTP указывает на 127.0.0.1:9 (отказ сразу).
import { describe, expect, test } from "vitest";
import { mailStatusBody } from "../../schemas/admin";
import { expectOk } from "../../support/expect";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins } from "./helpers";

const server = useServer({ env: { ...ADMIN_ENV, SMTP_HOST: "127.0.0.1", SMTP_PORT: "9" } });
const { primary } = admins(() => server().baseUrl);

describe("GET /api/admin/mail-status", () => {
  test("configured=true, ok=false и текст ошибки соединения", async () => {
    const p = await primary();
    const body = expectOk(await p.api.get("/api/admin/mail-status"), mailStatusBody);
    expect(body).toMatchObject({ from: "Shalter", configured: true, ok: false, directEnabled: false, dns: { domain: null, ip: null, records: [] } });
    expect(body.error).toMatch(/ECONNREFUSED/);
  });
});
