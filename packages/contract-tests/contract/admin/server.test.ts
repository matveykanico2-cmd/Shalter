// Раздел «server»: состояние сервера (GET /server) и почты (GET /mail-status).
// MAIL_FROM в ADMIN_ENV без домена — проверка DNS в /mail-status наружу не ходит.
import { describe, expect, test } from "vitest";
import { mailStatusBody, serverStatsBody } from "../../schemas/admin";
import { expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins, sectionAdmin, wsPool } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const ws = wsPool();
const { primary } = admins(() => server().baseUrl);

describe("GET /api/admin/server", () => {
  test("железо, процесс, хранилище, таблицы базы и число сокетов", async () => {
    const { baseUrl } = server();
    const srv = await sectionAdmin(baseUrl, await primary(), ["server"]);
    const other = await registerUser(baseUrl);
    await ws(srv.api);
    await ws(other.api);
    await ws(other.api.clone());

    const stats = expectOk(await srv.api.get("/api/admin/server"), serverStatsBody);
    expect(stats.realtime.onlineUsers).toBeGreaterThanOrEqual(2);
    expect(stats.realtime.sockets).toBeGreaterThanOrEqual(3);
    expect(stats.host.node).toBe(process.version);
    expect(stats.host.cores).toBeGreaterThan(0);
    expect(stats.cpu.perCore).toHaveLength(stats.host.cores);
    expect(stats.storage).toMatchObject({ uploadsInS3: false, uploadsTruncated: false });
    expect(stats.storage.db).toBeGreaterThan(0);
    expect(stats.storage.total).toBe(stats.storage.db + stats.storage.wal + stats.storage.shm + stats.storage.uploads);
    const users = stats.db.tables.find((t) => t.name === "users");
    // Пользователи: главный админ, админ раздела, второй, плюс служебные боты.
    expect(users?.rows).toBeGreaterThanOrEqual(3);
    expect(stats.db.totalRows).toBe(stats.db.tables.reduce((a, t) => a + t.rows, 0));
    expect(stats.disk).toHaveProperty("total");
  });
});

describe("GET /api/admin/mail-status", () => {
  test("SMTP не настроен: configured=false, прямая отправка выключена окружением тестов, домена нет", async () => {
    const srv = await sectionAdmin(server().baseUrl, await primary(), ["server"]);
    expect(expectOk(await srv.api.get("/api/admin/mail-status"), mailStatusBody)).toEqual({
      from: "Shalter",
      configured: false,
      ok: false,
      error: null,
      directEnabled: false,
      dns: { domain: null, ip: null, records: [] },
    });
  });
});
