// «Люди рядом» (/api/nearby): публикация своего места, список людей с грубой
// дистанцией (корзины «менее 1 км» … «более 30 км»), выход из списка, блокировки.
// Список общий на весь сервер, поэтому тесты смотрят только на «своих» людей.
import { describe, expect, test } from "vitest";
import { okBody } from "../../schemas/common";
import { nearbyBody } from "../../schemas/nearby";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { expectAll401 } from "../stars/helpers";

const server = useServer();

const BUCKETS = ["менее 1 км", "1–3 км", "3–10 км", "10–30 км", "более 30 км"];

async function share(user: TestUser, lat: number, lng: number) {
  return expectOk(await user.api.post("/api/nearby", { lat, lng }), nearbyBody).users;
}

async function look(user: TestUser, lat: number | string, lng: number | string) {
  return expectOk(await user.api.get("/api/nearby", { query: { lat, lng } }), nearbyBody).users;
}

/** id → корзина, только для перечисленных людей. */
function labelsOf(users: Array<{ id: string; label: string }>, of: TestUser[]): Record<string, string | undefined> {
  return Object.fromEntries(of.map((u) => [u.id, users.find((x) => x.id === u.id)?.label]));
}

describe("без сессии", () => {
  test("POST/GET/DELETE /api/nearby — 401 unauthorized", async () => {
    await expectAll401(server().baseUrl, [
      ["POST", "/api/nearby"],
      ["GET", "/api/nearby"],
      ["DELETE", "/api/nearby"],
    ]);
  });
});

describe("проверка координат", () => {
  test("POST: не числа или вне диапазона — 400 invalid coordinates", async () => {
    const user = await registerUser(server().baseUrl);
    for (const body of [{}, { lat: 10 }, { lng: 10 }, { lat: "abc", lng: 1 }, { lat: 90.01, lng: 0 }, { lat: -91, lng: 0 }, { lat: 0, lng: 180.5 }, { lat: 0, lng: -181 }]) {
      expectError(await user.api.post("/api/nearby", body), 400, "invalid coordinates");
    }
    // Границы диапазона допустимы.
    expectOk(await user.api.post("/api/nearby", { lat: 90, lng: -180 }), nearbyBody);
    expectOk(await user.api.post("/api/nearby", { lat: "-90", lng: "180" }), nearbyBody);
  });

  test("POST: пустая строка и null — 400, а не место «0, 0»", async () => {
    const [user, viewer] = await registerUsers(server().baseUrl, 2);
    for (const body of [{ lat: "", lng: null }, { lat: "  ", lng: 0 }, { lat: 0, lng: null }, { lat: true, lng: 0 }]) {
      expectError(await user.api.post("/api/nearby", body), 400, "invalid coordinates");
    }
    expect(labelsOf(await look(viewer, 0, 0), [user])).toEqual({});
  });

  test("GET: lat/lng обязательны, должны быть числами и в том же диапазоне, что и в POST", async () => {
    const user = await registerUser(server().baseUrl);
    expectError(await user.api.get("/api/nearby"), 400, "invalid coordinates");
    expectError(await user.api.get("/api/nearby", { query: { lat: 10 } }), 400, "invalid coordinates");
    expectError(await user.api.get("/api/nearby", { query: { lat: "abc", lng: 1 } }), 400, "invalid coordinates");
    expectError(await user.api.get("/api/nearby", { query: { lat: "", lng: "" } }), 400, "invalid coordinates");
    expectError(await user.api.get("/api/nearby", { query: { lat: 1000, lng: 5000 } }), 400, "invalid coordinates");
    expectOk(await user.api.get("/api/nearby", { query: { lat: -90, lng: 180 } }), nearbyBody);
  });
});

describe("список людей рядом", () => {
  test("POST публикует место и возвращает людей по корзинам расстояния, ближние — первыми", async () => {
    const { baseUrl } = server();
    const [viewer, same, near, mid, far, veryFar] = await registerUsers(baseUrl, 6);
    // Широта 10°: 0,01° ≈ 1,1 км.
    await share(same, 10.001, 20);
    await share(near, 10.02, 20);
    await share(mid, 10.05, 20);
    await share(far, 10.15, 20);
    await share(veryFar, 10.4, 20);

    const users = await share(viewer, 10, 20);
    expect(users.some((u) => u.id === viewer.id)).toBe(false);
    expect(labelsOf(users, [same, near, mid, far, veryFar])).toEqual({
      [same.id]: "менее 1 км",
      [near.id]: "1–3 км",
      [mid.id]: "3–10 км",
      [far.id]: "10–30 км",
      [veryFar.id]: "более 30 км",
    });
    // Порядок — по корзинам (внутри корзины перемешано).
    const order = users.map((u) => BUCKETS.indexOf(u.label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Точных координат нет — только имя, юзернейм, аватар и корзина.
    expect(users.find((u) => u.id === same.id)).toEqual({
      id: same.id,
      name: same.name,
      username: same.username,
      avatarColor: expect.any(String),
      avatarImage: null,
      label: "менее 1 км",
    });

    // Тот же человек видит смотрящего в своём списке.
    expect(labelsOf(await look(near, 10.02, 20), [viewer])).toEqual({ [viewer.id]: "1–3 км" });

    for (const u of [viewer, same, near, mid, far, veryFar]) expectOk(await u.api.delete("/api/nearby"), okBody);
  });

  test("GET считает расстояние от переданной точки и не публикует самого смотрящего", async () => {
    const { baseUrl } = server();
    const [sharer, onlyLooks, third] = await registerUsers(baseUrl, 3);
    await share(sharer, -30, 40);
    expect(labelsOf(await look(onlyLooks, -30, 40), [sharer])).toEqual({ [sharer.id]: "менее 1 км" });
    expect(labelsOf(await look(onlyLooks, -30.2, 40), [sharer])).toEqual({ [sharer.id]: "10–30 км" });
    // onlyLooks только смотрел — его в списках нет.
    expect(labelsOf(await look(third, -30, 40), [sharer, onlyLooks])).toEqual({ [sharer.id]: "менее 1 км", [onlyLooks.id]: undefined });
    expectOk(await sharer.api.delete("/api/nearby"), okBody);
  });

  test("радиус 50 км: дальше — не в списке, в том числе с другого конца света", async () => {
    const [here, there, edge, beyond] = await registerUsers(server().baseUrl, 4);
    await share(there, -60, -170);
    // Широта 50°: 0,01° по широте ≈ 1,1 км — 0,4° ≈ 44 км, 0,5° ≈ 56 км.
    await share(edge, 50.4, 30);
    await share(beyond, 50.5, 30);
    expect(labelsOf(await share(here, 50, 30), [there, edge, beyond])).toEqual({ [there.id]: undefined, [edge.id]: "более 30 км", [beyond.id]: undefined });
    expect(labelsOf(await look(there, 60, 170), [here])).toEqual({ [here.id]: undefined });
    for (const u of [here, there, edge, beyond]) expectOk(await u.api.delete("/api/nearby"), okBody);
  });

  test("повторный POST переносит человека в новую точку", async () => {
    const [mover, viewer] = await registerUsers(server().baseUrl, 2);
    await share(mover, 40, 40);
    expect(labelsOf(await look(viewer, 40, 40), [mover])).toEqual({ [mover.id]: "менее 1 км" });
    await share(mover, 40.05, 40);
    expect(labelsOf(await look(viewer, 40, 40), [mover])).toEqual({ [mover.id]: "3–10 км" });
    expectOk(await mover.api.delete("/api/nearby"), okBody);
  });
});

describe("DELETE /api/nearby", () => {
  test("убирает человека из чужих списков; повторный вызов — тоже ok", async () => {
    const [leaver, viewer] = await registerUsers(server().baseUrl, 2);
    await share(leaver, 50, 50);
    expect(labelsOf(await look(viewer, 50, 50), [leaver])).toEqual({ [leaver.id]: "менее 1 км" });
    expectOk(await leaver.api.delete("/api/nearby"), okBody);
    expectOk(await leaver.api.delete("/api/nearby"), okBody);
    expect(labelsOf(await look(viewer, 50, 50), [leaver])).toEqual({ [leaver.id]: undefined });
  });
});

describe("блокировки", () => {
  test("заблокированные не видят друг друга ни с одной стороны", async () => {
    const [viewer, blockedByViewer, blockerOfViewer, neutral] = await registerUsers(server().baseUrl, 4);
    expect((await viewer.api.post(`/api/users/${blockedByViewer.id}/block`, { blocked: true })).status).toBe(200);
    expect((await blockerOfViewer.api.post(`/api/users/${viewer.id}/block`, { blocked: true })).status).toBe(200);
    for (const u of [viewer, blockedByViewer, blockerOfViewer, neutral]) await share(u, -45, -45);

    expect(labelsOf(await look(viewer, -45, -45), [blockedByViewer, blockerOfViewer, neutral])).toEqual({
      [blockedByViewer.id]: undefined,
      [blockerOfViewer.id]: undefined,
      [neutral.id]: "менее 1 км",
    });
    expect(labelsOf(await look(blockedByViewer, -45, -45), [viewer, neutral])).toEqual({ [viewer.id]: undefined, [neutral.id]: "менее 1 км" });
    expect(labelsOf(await look(blockerOfViewer, -45, -45), [viewer, neutral])).toEqual({ [viewer.id]: undefined, [neutral.id]: "менее 1 км" });
    expect(labelsOf(await look(neutral, -45, -45), [viewer, blockedByViewer, blockerOfViewer])).toEqual({
      [viewer.id]: "менее 1 км",
      [blockedByViewer.id]: "менее 1 км",
      [blockerOfViewer.id]: "менее 1 км",
    });
  });
});
