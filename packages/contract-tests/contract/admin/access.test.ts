// Доступ к /api/admin: без сессии — 401, обычному пользователю — 403, админам
// разделов — только свой раздел, админам по номеру (главный и дополнительные) —
// всё. Выдача разделов — POST /users/:id/admin-sections, только главный админ.
import { describe, expect, test } from "vitest";
import { adminSectionsBody } from "../../schemas/admin";
import { sessionBody } from "../../schemas/auth";
import { selfUser } from "../../schemas/user";
import type { ApiResponse } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins, anonymous, grantSections, NO_RIGHTS, sectionAdmin, USER_NOT_FOUND, wsPool } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const ws = wsPool();
const { primary, extra } = admins(() => server().baseUrl);

const U = "u_nonexistent00";

/**
 * Все маршруты /api/admin с разделом, который они требуют. Тела подобраны так,
 * чтобы при наличии прав запрос ничего не менял (несуществующие id, пустые формы).
 */
const ENDPOINTS: Array<{ method: string; path: string; section: string; json?: unknown }> = [
  { method: "GET", path: "/api/admin/lookup?q=nobody-here", section: "legal" },
  { method: "GET", path: "/api/admin/chats/lookup?q=nothing-here", section: "moderation" },
  { method: "POST", path: "/api/admin/export", section: "legal", json: {} },
  { method: "GET", path: "/api/admin/export/media/sha_0000000000000000.txt", section: "legal" },
  { method: "GET", path: "/api/admin/exports", section: "legal" },
  { method: "GET", path: "/api/admin/moderation", section: "moderation" },
  { method: "GET", path: `/api/admin/users/${U}/reports`, section: "moderation" },
  { method: "POST", path: `/api/admin/users/${U}/ban`, section: "moderation", json: {} },
  { method: "POST", path: `/api/admin/users/${U}/label`, section: "moderation", json: {} },
  { method: "POST", path: `/api/admin/users/${U}/verify`, section: "moderation", json: {} },
  { method: "POST", path: `/api/admin/users/${U}/developer`, section: "server", json: {} },
  { method: "DELETE", path: `/api/admin/bots/${U}`, section: "moderation", json: {} },
  { method: "POST", path: "/api/admin/moderation/delete", section: "moderation", json: {} },
  { method: "POST", path: "/api/admin/chats/c_nonexistent00/verify", section: "moderation", json: {} },
  { method: "DELETE", path: `/api/admin/users/${U}`, section: "moderation", json: {} },
  { method: "POST", path: `/api/admin/users/${U}/reset-password`, section: "moderation", json: {} },
  { method: "GET", path: "/api/admin/mail-status", section: "server" },
  { method: "GET", path: "/api/admin/labels", section: "moderation" },
  { method: "POST", path: "/api/admin/labels", section: "moderation", json: {} },
  { method: "PATCH", path: "/api/admin/labels/nolabel", section: "moderation", json: {} },
  { method: "DELETE", path: "/api/admin/labels/nolabel", section: "moderation" },
  { method: "POST", path: "/api/admin/status-catalog", section: "moderation", json: {} },
  { method: "DELETE", path: "/api/admin/status-catalog/st_none_none", section: "moderation" },
  { method: "GET", path: "/api/admin/server", section: "server" },
  { method: "GET", path: "/api/admin/pricing", section: "pricing" },
  { method: "PUT", path: "/api/admin/pricing", section: "pricing", json: {} },
  { method: "DELETE", path: "/api/admin/pricing", section: "pricing" },
  { method: "POST", path: `/api/admin/users/${U}/admin-sections`, section: "primary", json: {} },
  { method: "GET", path: "/api/admin/directory", section: "moderation" },
];

function call(user: { api: TestUser["api"] } | ReturnType<typeof anonymous>, e: (typeof ENDPOINTS)[number]): Promise<ApiResponse> {
  const api = "api" in user ? user.api : user;
  return api.request(e.method, e.path, e.json === undefined ? {} : { json: e.json });
}

describe("без сессии и без прав", () => {
  test("все маршруты: 401 без сессии", async () => {
    const api = anonymous(server().baseUrl);
    for (const e of ENDPOINTS) expectError(await call(api, e), 401, "unauthorized");
  });

  test("обычному пользователю — 403 «Недостаточно прав» на всех маршрутах", async () => {
    const user = await registerUser(server().baseUrl);
    for (const e of ENDPOINTS) {
      const res = await call(user, e);
      expect(res.status, `${e.method} ${e.path}`).toBe(403);
      expect(res.body, `${e.method} ${e.path}`).toEqual({ error: NO_RIGHTS });
    }
  });

  test("разделы, которых нет в этих маршрутах (giftshop, emojicatalog, donations), ничего здесь не открывают", async () => {
    const { baseUrl } = server();
    const user = await sectionAdmin(baseUrl, await primary(), ["giftshop", "emojicatalog", "donations"]);
    for (const e of ENDPOINTS) expect((await call(user, e)).status, `${e.method} ${e.path}`).toBe(403);
  });
});

describe("админ раздела", () => {
  for (const section of ["moderation", "legal", "server", "pricing"]) {
    test(`раздел «${section}» открывает только свои маршруты`, async () => {
      const user = await sectionAdmin(server().baseUrl, await primary(), [section]);
      for (const e of ENDPOINTS) {
        const res = await call(user, e);
        if (e.section === section) expect(res.status, `${e.method} ${e.path}: ${res.text}`).not.toBe(403);
        else expect(res.status, `${e.method} ${e.path}`).toBe(403);
      }
    });
  }

  test("дополнительный админ по номеру (PREMIUM_ADMIN_PHONES) — все разделы, кроме выдачи разделов", async () => {
    const a = await extra();
    expect(expectShape(selfUser, a.self)).toMatchObject({ adminSections: [], isDeveloper: true, isVerified: true });
    expect(a.self).not.toHaveProperty("isPrimaryAdmin");
    for (const e of ENDPOINTS) {
      const res = await call(a, e);
      if (e.section === "primary") expectError(res, 403, NO_RIGHTS);
      else expect(res.status, `${e.method} ${e.path}: ${res.text}`).not.toBe(403);
    }
  });

  test("главный админ — все маршруты, isPrimaryAdmin в selfUser", async () => {
    const a = await primary();
    expect(expectShape(selfUser, a.self)).toMatchObject({ isPrimaryAdmin: true, adminSections: [] });
    for (const e of ENDPOINTS) {
      const res = await call(a, e);
      expect(res.status, `${e.method} ${e.path}: ${res.text}`).not.toBe(403);
    }
  });
});

describe("POST /api/admin/users/:id/admin-sections", () => {
  test("главный админ выдаёт разделы: неизвестные отбрасываются, повторы схлопываются; self:updated только адресату", async () => {
    const { baseUrl } = server();
    const p = await primary();
    const target = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [targetWs, outsiderWs] = await Promise.all([ws(target.api), ws(outsider.api)]);

    const res = await p.api.post(`/api/admin/users/${target.id}/admin-sections`, {
      sections: ["moderation", "root", "legal", "moderation", 42],
    });
    expect(expectOk(res, adminSectionsBody)).toEqual({ user: { id: target.id, adminSections: ["moderation", "legal"] } });

    const ev = await targetWs.waitFor("self:updated", (e) => e.user?.id === target.id, 8000);
    expect(ev).toEqual({ type: "self:updated", user: { id: target.id, adminSections: ["moderation", "legal"] } });
    await outsiderWs.expectNone("self:updated");

    const session = expectOk(await target.api.get("/api/auth/session"), sessionBody);
    expect(session.user?.adminSections).toEqual(["moderation", "legal"]);
    expect(session.user).not.toHaveProperty("isPrimaryAdmin");
    expect((await target.api.get("/api/admin/moderation")).status).toBe(200);
  });

  test("снятие разделов: не массив → пустой список, доступ пропадает", async () => {
    const { baseUrl } = server();
    const p = await primary();
    const target = await sectionAdmin(baseUrl, p, ["moderation"]);
    expect((await target.api.get("/api/admin/labels")).status).toBe(200);

    expect(expectOk(await p.api.post(`/api/admin/users/${target.id}/admin-sections`, { sections: "moderation" }), adminSectionsBody)).toEqual({
      user: { id: target.id, adminSections: [] },
    });
    expectError(await target.api.get("/api/admin/labels"), 403, NO_RIGHTS);
    expect(expectOk(await target.api.get("/api/auth/session"), sessionBody).user?.adminSections).toEqual([]);
  });

  test("ошибки: 404 на неизвестного, 403 админу раздела и дополнительному админу", async () => {
    const { baseUrl } = server();
    const p = await primary();
    expectError(await p.api.post(`/api/admin/users/${U}/admin-sections`, { sections: ["legal"] }), 404, USER_NOT_FOUND);

    const mod = await sectionAdmin(baseUrl, p, ["moderation", "legal", "server", "pricing"]);
    const victim = await registerUser(baseUrl);
    expectError(await mod.api.post(`/api/admin/users/${victim.id}/admin-sections`, { sections: ["legal"] }), 403, NO_RIGHTS);
    expectError(await mod.api.post(`/api/admin/users/${mod.id}/admin-sections`, { sections: ["giftshop"] }), 403, NO_RIGHTS);
    expectError(await (await extra()).api.post(`/api/admin/users/${victim.id}/admin-sections`, { sections: ["legal"] }), 403, NO_RIGHTS);
    expect(expectOk(await victim.api.get("/api/auth/session"), sessionBody).user?.adminSections).toEqual([]);
  });

  test("разделы можно выдать и самому главному админу — на его права это не влияет", async () => {
    const p = await primary();
    await grantSections(p, p, ["pricing"]);
    const me = expectOk(await p.api.get("/api/auth/session"), sessionBody).user;
    expect(me).toMatchObject({ adminSections: ["pricing"], isPrimaryAdmin: true });
    expect((await p.api.get("/api/admin/server")).status).toBe(200);
    await grantSections(p, p, []);
  });
});
