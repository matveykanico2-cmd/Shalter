// Платные звонки от незнакомых: кто платит, сколько и кто звонит бесплатно. Нужен главный
// админ — он начисляет звёзды и выдаёт Premium. server/routes/calls.js (chargeForColdCall).
import { beforeAll, describe, expect, test } from "vitest";
import { createDm, createGroup, registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { adminEnv, grantStars, registerAdmin, starsBalance } from "../stars/helpers";
import { patchCall, startCall } from "./helpers";

const ADMIN_PHONE = "+70000000917";
const server = useServer({ env: adminEnv(ADMIN_PHONE) });

let admin: TestUser;
beforeAll(async () => {
  admin = await registerAdmin(server().baseUrl, ADMIN_PHONE);
});

async function paidPair(price: number) {
  const [a, b] = await registerUsers(server().baseUrl, 2);
  expect((await b.api.post("/api/stars/price", { stars: price })).status).toBe(200);
  return { a, b, dm: await createDm(a, b) };
}

describe("POST /api/calls — цена звонка незнакомцу", () => {
  test("звёзд хватает: цена списывается со звонящего и приходит вызываемому, за каждый звонок", async () => {
    const { a, b, dm } = await paidPair(7);
    await grantStars(admin, a, 20);

    const call = await startCall(a, dm.id);
    expect(await starsBalance(a)).toBe(13);
    expect(await starsBalance(b)).toBe(7);

    await patchCall(a, call.id, { status: "ended" });
    await startCall(a, dm.id);
    expect(await starsBalance(a)).toBe(6);
    expect(await starsBalance(b)).toBe(14);
  });

  test("с Premium — бесплатно; в группе цена не берётся; сам вызываемый звонит бесплатно", async () => {
    const { a, b, dm } = await paidPair(5);
    expect((await admin.api.post("/api/premium/grant", { userId: a.id, days: 30 })).status).toBe(200);
    await startCall(a, dm.id);
    expect(await starsBalance(a)).toBe(0);
    expect(await starsBalance(b)).toBe(0);

    const [c] = await registerUsers(server().baseUrl, 1);
    const group = await createGroup(c, [b]);
    await startCall(c, group.id, { ringAll: true });
    expect(await starsBalance(c)).toBe(0);

    await startCall(b, dm.id);
    expect(await starsBalance(b)).toBe(0);
  });
});
