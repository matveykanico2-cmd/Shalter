// Каталог своих эмодзи (server/routes/customEmoji.js, data/customEmoji.js): читать
// может любой, менять — только админ или тот, кому главный админ выдал раздел
// «emojicatalog» (POST /api/admin/users/:id/admin-sections). Сервер с админским номером.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { emojiBody, emojiListBody } from "../../schemas/stickers";
import { socketPool } from "../ws/helpers";

const ADMIN_PHONE = "+70000000773";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const open = socketPool();

let admin: TestUser | undefined;
async function getAdmin(): Promise<TestUser> {
  admin ??= await registerUser(server().baseUrl, { phone: ADMIN_PHONE, name: "Админ" });
  return admin;
}

async function grant(user: TestUser, sections: string[]) {
  const res = await (await getAdmin()).api.post(`/api/admin/users/${user.id}/admin-sections`, { sections });
  expect(res.status, res.text).toBe(200);
}

const STAR = { layers: [{ type: "star", fill: "#ABC" }] };
const NO_RIGHTS = "Недостаточно прав";
const EMPTY_SCENE = "Нарисуйте эмодзи — добавьте хотя бы одну фигуру";

describe("без сессии", () => {
  test.each([
    ["GET", "/api/custom-emoji"],
    ["POST", "/api/custom-emoji"],
    ["PATCH", "/api/custom-emoji/ce_x_y"],
    ["DELETE", "/api/custom-emoji/ce_x_y"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    expectError(await new Api(server().baseUrl).request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("права", () => {
  test("обычный пользователь — 403 на изменения; раздел moderation не помогает; emojicatalog — даёт", async () => {
    const adm = await getAdmin();
    const user = await registerUser(server().baseUrl);
    const created = expectOk(await adm.api.post("/api/custom-emoji", { name: "Звезда", scene: STAR }), emojiBody).emoji;

    expectError(await user.api.post("/api/custom-emoji", { name: "x", scene: STAR }), 403, NO_RIGHTS);
    expectError(await user.api.patch(`/api/custom-emoji/${created.id}`, { name: "x" }), 403, NO_RIGHTS);
    expectError(await user.api.delete(`/api/custom-emoji/${created.id}`), 403, NO_RIGHTS);
    // 403 раньше 404: о существовании id посторонний не узнаёт.
    expectError(await user.api.delete("/api/custom-emoji/ce_nope_000000"), 403, NO_RIGHTS);

    await grant(user, ["moderation"]);
    expectError(await user.api.post("/api/custom-emoji", { name: "x", scene: STAR }), 403, NO_RIGHTS);

    await grant(user, ["emojicatalog"]);
    const own = expectOk(await user.api.post("/api/custom-emoji", { name: "Своё", scene: STAR }), emojiBody).emoji;
    // Редактор каталога может менять и чужие эмодзи.
    expectOk(await user.api.patch(`/api/custom-emoji/${created.id}`, { name: "Переименовано" }), emojiBody);
    expectOk(await user.api.delete(`/api/custom-emoji/${own.id}`), okBody);

    await grant(user, []);
    expectError(await user.api.post("/api/custom-emoji", { name: "x", scene: STAR }), 403, NO_RIGHTS);
  });
});

describe("каталог", () => {
  test("создание: сцена очищается, имя обрезается до 40; список видят все, новые — первыми", async () => {
    const adm = await getAdmin();
    const viewer = await registerUser(server().baseUrl);
    const res = expectOk(
      await adm.api.post("/api/custom-emoji", { name: `  ${"Э".repeat(50)}  `, scene: { loop: 0, bg: "nope", layers: [{ type: "star", fill: "#ABC", x: 500, extra: 1 }, { type: "bogus" }] } }),
      emojiBody
    );
    expect(res.emoji).toEqual({
      id: expect.any(String),
      name: "Э".repeat(40),
      scene: { v: 1, loop: 1, bg: null, layers: [{ type: "star", x: 100, y: 50, fill: "#abc", opacity: 1, rot: 0, anim: "none", delay: 0, dur: 1.6, size: 34 }] },
      createdAt: expect.any(String),
    });
    // Ни ownerId, ни автора наружу не отдаётся.
    expect(res.emoji).not.toHaveProperty("ownerId");

    const next = expectOk(await adm.api.post("/api/custom-emoji", { scene: STAR }), emojiBody).emoji;
    expect(next.name).toBe("");
    const list = expectOk(await viewer.api.get("/api/custom-emoji"), emojiListBody);
    expect(list.maxEmoji).toBe(500);
    const ids = list.emoji.map((e) => e.id);
    expect(ids.indexOf(next.id)).toBeLessThan(ids.indexOf(res.emoji.id));
  });

  test("пустая сцена — 400 при создании и изменении", async () => {
    const adm = await getAdmin();
    for (const scene of [undefined, {}, { layers: [] }, { layers: [{ type: "bogus" }] }, "star"]) {
      expectError(await adm.api.post("/api/custom-emoji", { name: "x", scene }), 400, EMPTY_SCENE);
    }
    const e = expectOk(await adm.api.post("/api/custom-emoji", { scene: STAR }), emojiBody).emoji;
    expectError(await adm.api.patch(`/api/custom-emoji/${e.id}`, { scene: { layers: [] } }), 400, EMPTY_SCENE);
  });

  test("PATCH: только переданные поля; несуществующий — 404", async () => {
    const adm = await getAdmin();
    const e = expectOk(await adm.api.post("/api/custom-emoji", { name: "Было", scene: STAR }), emojiBody).emoji;
    const renamed = expectOk(await adm.api.patch(`/api/custom-emoji/${e.id}`, { name: "  Стало  " }), emojiBody).emoji;
    expect(renamed).toEqual({ ...e, name: "Стало" });
    const redrawn = expectOk(await adm.api.patch(`/api/custom-emoji/${e.id}`, { scene: { layers: [{ type: "heart" }] } }), emojiBody).emoji;
    expect(redrawn.name).toBe("Стало");
    expect(redrawn.scene.layers.map((l) => l.type)).toEqual(["heart"]);
    // Пустое имя при изменении — допускается (в отличие от стикерпаков).
    expect(expectOk(await adm.api.patch(`/api/custom-emoji/${e.id}`, { name: "  " }), emojiBody).emoji.name).toBe("");
    expectError(await adm.api.patch("/api/custom-emoji/ce_nope_000000", { name: "x" }), 404, "Эмодзи не найден");
  });

  test("DELETE: удаляет; повторно — 404; изменения каталога по WS не рассылаются", async () => {
    const adm = await getAdmin();
    const viewer = await registerUser(server().baseUrl);
    const ws = await open(viewer.api);
    const e = expectOk(await adm.api.post("/api/custom-emoji", { scene: STAR }), emojiBody).emoji;
    expectOk(await adm.api.delete(`/api/custom-emoji/${e.id}`), okBody);
    expect((await viewer.api.get("/api/custom-emoji")).body.emoji.map((x: any) => x.id)).not.toContain(e.id);
    expectError(await adm.api.delete(`/api/custom-emoji/${e.id}`), 404, "Эмодзи не найден");
    await new Promise((r) => setTimeout(r, 400));
    expect(ws.events.filter((x) => x.type !== "presence:update")).toEqual([]);
  });
});
