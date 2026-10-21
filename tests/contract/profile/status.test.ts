// Статус-иконка у имени (server/routes/profileStatus.js, lib/profileStatus.js):
// свои картинки или из каталога (/api/status-catalog, наполняет админ через
// /api/admin/status-catalog), 1 слот без Premium и 5 с Premium, активный —
// statusIcon/statusName в publicUser. Сервер с админским номером — для каталога.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { catalogCreateBody, statusActiveBody, statusCatalogBody, statusChangeBody, statusMeBody } from "../../schemas/profile";
import { otherProfileBody } from "../../schemas/users";
import { contactUpdated } from "../../schemas/ws";
import { registerPremiumUser } from "../chats/helpers";
import { socketPool } from "../ws/helpers";

const ADMIN_PHONE = "+70000000772";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const open = socketPool();

const IMG = "data:image/png;base64,iVBORw0KGgo=";
const GIF = "data:image/gif;base64,R0lGODlh";

let admin: TestUser | undefined;
async function getAdmin(): Promise<TestUser> {
  admin ??= await registerUser(server().baseUrl, { phone: ADMIN_PHONE, name: "Админ" });
  return admin;
}

describe("без сессии", () => {
  test.each([
    ["GET", "/api/status/me"],
    ["POST", "/api/status/me"],
    ["POST", "/api/status/me/active"],
    ["DELETE", "/api/status/me/us_x_y"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });

  test("каталог статусов без сессии → 401 unauthorized", async () => {
    expectError(await new Api(server().baseUrl).get("/api/status-catalog"), 401, "unauthorized");
  });
});

describe("свои статусы", () => {
  test("первый — сразу активный; имя обрезается до 40; виден другим в профиле", async () => {
    const [me, viewer] = await registerUsers(server().baseUrl, 2);
    expect(expectOk(await me.api.get("/api/status/me"), statusMeBody)).toEqual({ items: [], activeId: null, max: 1 });

    const res = expectOk(await me.api.post("/api/status/me", { image: IMG, name: `  ${"я".repeat(50)}  ` }), statusChangeBody);
    expect(res.items).toEqual([{ id: expect.any(String), image: IMG, name: "я".repeat(40), addedAt: expect.any(String) }]);
    expect(res.activeId).toBe(res.items[0].id);
    expect(res.user).toMatchObject({ id: me.id, statusIcon: IMG, statusName: "я".repeat(40) });
    expect(res.user).not.toHaveProperty("phone");

    expect(expectOk(await me.api.get("/api/status/me"), statusMeBody)).toEqual({ items: res.items, activeId: res.activeId, max: 1 });
    expect(expectOk(await viewer.api.get(`/api/users/${me.id}`), otherProfileBody).user).toMatchObject({ statusIcon: IMG, statusName: "я".repeat(40) });
  });

  test("без имени — statusName null; gif допустим", async () => {
    const me = await registerUser(server().baseUrl);
    const res = expectOk(await me.api.post("/api/status/me", { image: GIF }), statusChangeBody);
    expect(res.items[0].name).toBe("");
    expect(res.user).toMatchObject({ statusIcon: GIF, statusName: null });
  });

  const invalid: Array<[string, unknown, string]> = [
    ["без картинки", undefined, "Некорректное изображение"],
    ["ссылка", "https://evil.example/s.png", "Некорректное изображение"],
    ["svg", "data:image/svg+xml;base64,PHN2Zz4=", "Некорректное изображение"],
    ["больше 80 КБ", `data:image/png;base64,${"A".repeat(80 * 1024)}`, "Картинка слишком большая"],
  ];
  test.each(invalid)("%s → 400", async (_what, image, error) => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/status/me", { image, name: "x" }), 400, error);
    expect((await me.api.get("/api/status/me")).body.items).toEqual([]);
  });

  test("без Premium — один слот, второй 409", async () => {
    const me = await registerUser(server().baseUrl);
    await me.api.post("/api/status/me", { image: IMG });
    expectError(await me.api.post("/api/status/me", { image: GIF }), 409, "Больше одного статуса не поместится — сначала удалите текущий");
  });

  test("с Premium — 5 слотов; новые не меняют активный; шестой 409", async () => {
    const me = await registerPremiumUser(server().baseUrl);
    expect((await me.api.get("/api/status/me")).body.max).toBe(5);
    const first = expectOk(await me.api.post("/api/status/me", { image: IMG, name: "1" }), statusChangeBody);
    for (let i = 2; i <= 5; i++) {
      const res = expectOk(await me.api.post("/api/status/me", { image: IMG, name: String(i) }), statusChangeBody);
      expect(res.activeId).toBe(first.activeId);
      expect(res.items).toHaveLength(i);
    }
    expectError(await me.api.post("/api/status/me", { image: IMG }), 409, "Больше 5 статусов не поместится");
  });

  test("POST /me/active: выбрать, снять (null или без id), чужой/неизвестный — 404", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const mine = expectOk(await me.api.post("/api/status/me", { image: IMG, name: "мой" }), statusChangeBody).items[0];
    const foreign = expectOk(await other.api.post("/api/status/me", { image: GIF }), statusChangeBody).items[0];

    const off = expectOk(await me.api.post("/api/status/me/active", { id: null }), statusActiveBody);
    expect(off).toMatchObject({ activeId: null, user: { statusIcon: null, statusName: null } });
    const on = expectOk(await me.api.post("/api/status/me/active", { id: mine.id }), statusActiveBody);
    expect(on).toMatchObject({ activeId: mine.id, user: { statusIcon: IMG, statusName: "мой" } });
    expect(expectOk(await me.api.post("/api/status/me/active", {}), statusActiveBody).activeId).toBeNull();

    expectError(await me.api.post("/api/status/me/active", { id: foreign.id }), 404, "Статус не найден");
    expectError(await me.api.post("/api/status/me/active", { id: "us_nope_000000" }), 404, "Статус не найден");
    expect((await me.api.get("/api/status/me")).body.activeId).toBeNull();
  });

  test("DELETE /me/:id: активный — снимается; неизвестный — 200 без изменений; освобождает слот", async () => {
    const me = await registerUser(server().baseUrl);
    const item = expectOk(await me.api.post("/api/status/me", { image: IMG }), statusChangeBody).items[0];
    const unchanged = expectOk(await me.api.delete("/api/status/me/us_nope_000000"), statusChangeBody);
    expect(unchanged).toMatchObject({ items: [item], activeId: item.id });

    const res = expectOk(await me.api.delete(`/api/status/me/${item.id}`), statusChangeBody);
    expect(res).toMatchObject({ items: [], activeId: null, user: { statusIcon: null, statusName: null } });
    expectOk(await me.api.post("/api/status/me", { image: GIF }), statusChangeBody);
  });

  test("смена статуса рассылается contact:updated — себе и собеседникам", async () => {
    const [me, peer] = await registerUsers(server().baseUrl, 2);
    await createDm(peer, me);
    const [meWs, peerWs] = await Promise.all([open(me.api), open(peer.api)]);
    const item = expectOk(await me.api.post("/api/status/me", { image: IMG, name: "новый" }), statusChangeBody).items[0];
    expect((await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000)).user).toMatchObject({ statusIcon: IMG, statusName: "новый" });
    const forPeer = expectShape(contactUpdated, await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000)).user;
    expect(forPeer).toMatchObject({ statusIcon: IMG, statusName: "новый" });

    expectOk(await me.api.post("/api/status/me/active", { id: null }), statusActiveBody);
    await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id && e.user.statusName === null, 10_000);
    peerWs.clear();
    expectOk(await me.api.post("/api/status/me/active", { id: item.id }), statusActiveBody);
    await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id && e.user.statusName === "новый", 10_000);
    expectOk(await me.api.delete(`/api/status/me/${item.id}`), statusChangeBody);
    await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id && e.user.statusIcon === null, 10_000);
  });
});

describe("каталог статусов", () => {
  test("админ добавляет; статус из каталога берёт картинку и имя каталога и помнит catalogId", async () => {
    const adm = await getAdmin();
    const item = expectOk(await adm.api.post("/api/admin/status-catalog", { image: GIF, name: "  Каталожный  " }), catalogCreateBody).item;
    expect(item).toEqual({ id: expect.any(String), image: GIF, name: "Каталожный", createdAt: expect.any(String) });

    const me = await registerUser(server().baseUrl);
    const catalog = expectOk(await me.api.get("/api/status-catalog"), statusCatalogBody).items;
    expect(catalog).toContainEqual(item);

    const res = expectOk(await me.api.post("/api/status/me", { catalogId: item.id, image: IMG, name: "своё имя" }), statusChangeBody);
    expect(res.items).toEqual([{ id: expect.any(String), image: GIF, name: "Каталожный", catalogId: item.id, addedAt: expect.any(String) }]);
    expect(res.user).toMatchObject({ statusIcon: GIF, statusName: "Каталожный" });
  });

  test("неизвестный catalogId — 404, даже если есть своя картинка", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/status/me", { catalogId: "st_nope_000000", image: IMG }), 404, "Такого статуса нет в каталоге");
  });

  test("удаление из каталога не трогает уже выбранные статусы", async () => {
    const adm = await getAdmin();
    const item = expectOk(await adm.api.post("/api/admin/status-catalog", { image: IMG, name: "временный" }), catalogCreateBody).item;
    const me = await registerUser(server().baseUrl);
    await me.api.post("/api/status/me", { catalogId: item.id });
    expect((await adm.api.delete(`/api/admin/status-catalog/${item.id}`)).status).toBe(200);
    expect((await me.api.get("/api/status-catalog")).body.items).not.toContainEqual(item);
    expect((await me.api.get("/api/status/me")).body.items[0]).toMatchObject({ catalogId: item.id, name: "временный" });
  });
});
