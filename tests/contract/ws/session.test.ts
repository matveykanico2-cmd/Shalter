// Открытый сокет закрывается кодом 4001, как только доступ отозван: сеанс завершён
// с другого устройства, выход, смена пароля, удаление аккаунта, бан. Периодического
// перебора сокетов нет — сервер закрывает их по событию, до ответа на запрос.
import { describe, expect, test } from "vitest";
import { expectError } from "../../support/expect";
import { login, registerUser, uniqPhone, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { rejectedWsStatus } from "../../support/ws";
import { closedWithin, expectAlive, sleep, socketPool } from "./helpers";

const ADMIN_PHONE = uniqPhone();
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const open = socketPool();

let adminUser: TestUser | undefined;
async function admin(baseUrl: string): Promise<TestUser> {
  adminUser ??= await registerUser(baseUrl, { phone: ADMIN_PHONE });
  return adminUser;
}

// Сокет закрывается до ответа на запрос; окно — запас на доставку кадра закрытия.
const IMMEDIATE_MS = 500;

describe("сокет и завершение сеанса", () => {
  test("DELETE /api/sessions/:id с другого устройства — сокет закрыт 4001 session_revoked, новый upgrade — 401", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const laptopWs = await open(a.api);
    const phone = await login(baseUrl, a);
    const phoneWs = await open(phone);

    const sessions = (await phone.get("/api/sessions")).body.sessions as any[];
    const laptop = sessions.find((s) => !s.current);
    expect(laptop).toBeDefined();
    expect((await phone.delete(`/api/sessions/${laptop.id}`)).status).toBe(200);

    expect(await closedWithin(laptopWs, IMMEDIATE_MS)).toEqual({ code: 4001, reason: "session_revoked" });
    expect(await rejectedWsStatus(a.api)).toBe(401);
    expectError(await a.api.get("/api/contacts"), 401, "session_revoked");

    // Сокет устройства, с которого завершали, жив.
    await sleep(300);
    await expectAlive(phoneWs);
  });

  test("POST /api/sessions/terminate-others закрывает сокеты всех остальных устройств", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const other1 = await open(await login(baseUrl, a));
    const other2 = await open(await login(baseUrl, a));
    const currentWs = await open(a.api);
    // Вторая вкладка текущего устройства — та же сессия, её не трогают.
    const currentTab = await open(a.api.clone());

    expect((await a.api.post("/api/sessions/terminate-others")).status).toBe(200);
    const [c1, c2] = await Promise.all([closedWithin(other1, IMMEDIATE_MS), closedWithin(other2, IMMEDIATE_MS)]);
    expect(c1).toEqual({ code: 4001, reason: "session_revoked" });
    expect(c2).toEqual({ code: 4001, reason: "session_revoked" });
    await sleep(300);
    await expectAlive(currentWs);
    await expectAlive(currentTab);
  });
});

describe("сокет и смена пароля", () => {
  test("смена пароля сразу закрывает сокеты остальных устройств", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const otherWs = await open(await login(baseUrl, a));
    const currentWs = await open(a.api);
    const res = await a.api.post("/api/auth/change-password", { currentPassword: a.password, newPassword: "brand-new-1" });
    expect(res.status, res.text).toBe(200);
    expect(await closedWithin(otherWs, IMMEDIATE_MS)).toEqual({ code: 4001, reason: "session_revoked" });
    await expectAlive(currentWs);
  });
});

describe("сокет и удаление аккаунта", () => {
  test("удаление аккаунта сразу закрывает сокеты всех его устройств", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const currentWs = await open(a.api);
    const phoneWs = await open(await login(baseUrl, a));
    const res = await a.api.post("/api/auth/delete-account", { password: a.password });
    expect(res.status, res.text).toBe(200);
    const [c1, c2] = await Promise.all([closedWithin(currentWs, IMMEDIATE_MS), closedWithin(phoneWs, IMMEDIATE_MS)]);
    expect(c1).toEqual({ code: 4001, reason: "session_revoked" });
    expect(c2).toEqual({ code: 4001, reason: "session_revoked" });
  });
});

describe("сокет и выход", () => {
  test("POST /api/auth/logout сразу закрывает сокеты этого аккаунта на этом устройстве; другое устройство живо", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const tab = await open(a.api);
    const otherTab = await open(a.api.clone());
    const phoneWs = await open(await login(baseUrl, a));

    expect((await a.api.post("/api/auth/logout")).status).toBe(200);
    const [c1, c2] = await Promise.all([closedWithin(tab, IMMEDIATE_MS), closedWithin(otherTab, IMMEDIATE_MS)]);
    expect(c1).toEqual({ code: 4001, reason: "session_revoked" });
    expect(c2).toEqual({ code: 4001, reason: "session_revoked" });
    await sleep(300);
    await expectAlive(phoneWs);
  });
});

describe("сокет и бан", () => {
  test("бан администратором закрывает сокет 4001; HTTP отвечает 403 banned", async () => {
    const { baseUrl } = server();
    const adm = await admin(baseUrl);
    const target = await registerUser(baseUrl);
    const targetWs = await open(target.api);

    const ban = await adm.api.post(`/api/admin/users/${target.id}/ban`, { reason: "спам" });
    expect(ban.status, ban.text).toBe(200);

    expect(await closedWithin(targetWs, IMMEDIATE_MS)).toEqual({ code: 4001, reason: "session_revoked" });
    const res = await target.api.get("/api/contacts");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "banned", banReason: "спам", bannedAt: expect.any(String), bannedUntil: null });
  });

  test("забаненный проходит upgrade, но сокет сразу закрывается 4001", async () => {
    const { baseUrl } = server();
    const adm = await admin(baseUrl);
    const target = await registerUser(baseUrl);
    expect((await adm.api.post(`/api/admin/users/${target.id}/ban`, { reason: "спам" })).status).toBe(200);

    // upgrade проверяет и бан: сокет закрывается сразу после рукопожатия, событий забаненный не получает.
    const ws = await open(target.api);
    expect(await closedWithin(ws, IMMEDIATE_MS)).toEqual({ code: 4001, reason: "session_revoked" });
  });
});
