import { describe, expect, test } from "vitest";
import { exchangeBody, exchangeCoinBody, exchangeCreatorsBody } from "../../schemas/exchange";
import { expectError, expectOk, expectStatus } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { ADMIN_ENV, admins } from "../admin/helpers";

const server = useServer({ env: ADMIN_ENV });
const { primary } = admins(() => server().baseUrl);

describe("биржа монет без торговли", () => {
  test("админ выдаёт право, создатель добавляет монету и меняет курс, посетитель только смотрит", async () => {
    const admin = await primary();
    const creator = await registerUser(server().baseUrl, { name: "Создатель" });
    const viewer = await registerUser(server().baseUrl, { name: "Зритель" });

    const empty = expectOk(await viewer.api.get("/api/exchange"), exchangeBody);
    expect(empty).toMatchObject({ coins: [], permissions: { canCreate: false, isAdmin: false } });
    expectError(await viewer.api.post("/api/exchange/coins", { symbol: "NO", name: "Нельзя", color: "#112233", rate: 1 }), 403, "Нет права создавать монеты");

    const granted = expectOk(await admin.api.request("PUT", "/api/exchange/creators", { json: { userId: creator.id, enabled: true } }), exchangeCreatorsBody);
    expect(granted.creators).toEqual([expect.objectContaining({ userId: creator.id, name: "Создатель" })]);

    const made = expectOk(await creator.api.post("/api/exchange/coins", { symbol: "SHT", name: "Shalter Coin", description: "Тестовая монета", color: "#2aabee", rate: 10 }), exchangeCoinBody).coin;
    expect(made).toMatchObject({ symbol: "SHT", currentRate: 10, changePercent: 0 });
    expect(made.history).toHaveLength(1);

    const changed = expectOk(await creator.api.request("PUT", `/api/exchange/coins/${made.id}/rate`, { json: { rate: 12.5 } }), exchangeCoinBody).coin;
    expect(changed.currentRate).toBe(12.5);
    expect(changed.changePercent).toBe(25);
    expect(changed.history.map((point) => point.rate)).toEqual([10, 12.5]);

    const market = expectOk(await viewer.api.get("/api/exchange"), exchangeBody);
    expect(market.coins[0]).toMatchObject({ id: made.id, symbol: "SHT", currentRate: 12.5 });
    expectError(await viewer.api.request("PUT", `/api/exchange/coins/${made.id}/rate`, { json: { rate: 100 } }), 403, "Менять курс может администратор или создатель монеты");
    expectStatus(await viewer.api.post(`/api/exchange/coins/${made.id}/buy`, { amount: 1 }), 404);

    expectOk(await admin.api.request("PUT", "/api/exchange/creators", { json: { userId: creator.id, enabled: false } }), exchangeCreatorsBody);
    expectError(await creator.api.request("PUT", `/api/exchange/coins/${made.id}/rate`, { json: { rate: 13 } }), 403, "Менять курс может администратор или создатель монеты");
    expect((await admin.api.request("PUT", `/api/exchange/coins/${made.id}/rate`, { json: { rate: 14 } })).status).toBe(200);
  });

  test("валидация тикера, курса и повторного тикера", async () => {
    const admin = await primary();
    expectError(await admin.api.post("/api/exchange/coins", { symbol: "!", name: "x", color: "red", rate: 0 }), 400);
    await admin.api.post("/api/exchange/coins", { symbol: "ONE", name: "Первая", description: "", color: "#123456", rate: 1 });
    expectError(await admin.api.post("/api/exchange/coins", { symbol: "one", name: "Вторая", description: "", color: "#654321", rate: 2 }), 409, "Монета с таким тикером уже существует");
  });
});
