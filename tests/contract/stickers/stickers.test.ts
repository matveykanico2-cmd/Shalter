// Свои стикерпаки (server/routes/stickers.js, data/stickerPacks.js,
// lib/sanitizeSticker.js): видны только владельцу, стикеры трёх видов
// (эмодзи, картинка из загрузок, нарисованная сцена) — с очисткой.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { okBody } from "../../schemas/common";
import { packBody, packsListBody } from "../../schemas/stickers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";

const server = useServer();

describe("без сессии", () => {
  test.each([
    ["GET", "/api/stickers/packs"],
    ["POST", "/api/stickers/packs"],
    ["PATCH", "/api/stickers/packs/sp_x_y"],
    ["DELETE", "/api/stickers/packs/sp_x_y"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    expectError(await new Api(server().baseUrl).request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("создание", () => {
  test("три вида стикеров; мусор отбрасывается; название обрезается до 40", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    expect(expectOk(await me.api.get("/api/stickers/packs"), packsListBody)).toEqual({ packs: [], maxStickers: 60 });

    const img = await uploadedUrl(me, "webp");
    const res = expectOk(
      await me.api.post("/api/stickers/packs", {
        name: `  ${"П".repeat(50)}  `,
        stickers: [
          { emoji: " 😀 ", name: " улыбка ", anim: "bounce", scene: "party" },
          { emoji: "🔥", scene: "Bad Scene!", anim: "<script>" },
          { kind: "image", url: img, animated: true, emoji: "" },
          { kind: "image", url: "https://evil.example/x.png" },
          { kind: "custom", emoji: "🎈", scene: { loop: 99, bg: "#FFF", layers: [{ type: "circle", r: 99, fill: "red", extra: 1 }, { type: "bogus" }] } },
          { kind: "custom", scene: { layers: [] } },
          { name: "без эмодзи" },
          null,
          "строка",
        ],
      }),
      packBody
    );
    expect(res.pack).toEqual({
      id: expect.any(String),
      ownerId: me.id,
      name: "П".repeat(40),
      stickers: [
        // anim при сохранении отбрасывается, scene остаётся только как имя [a-z0-9_-].
        { emoji: "😀", name: "улыбка", scene: "party" },
        { emoji: "🔥", name: "" },
        { kind: "image", url: img, emoji: "🖼️", name: "", animated: true },
        {
          kind: "custom",
          emoji: "🎈",
          name: "",
          scene: {
            v: 1,
            loop: 12,
            bg: "#fff",
            layers: [{ type: "circle", x: 50, y: 50, fill: "#ff8a3d", opacity: 1, rot: 0, anim: "none", delay: 0, dur: 1.6, r: 50 }],
          },
        },
      ],
      createdAt: expect.any(String),
    });

    expect(expectOk(await me.api.get("/api/stickers/packs"), packsListBody).packs).toEqual([res.pack]);
    // Чужие паки не видны.
    expect((await other.api.get("/api/stickers/packs")).body.packs).toEqual([]);
  });

  test("ошибки: без названия, без стикеров", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/stickers/packs", { stickers: [{ emoji: "😀" }] }), 400, "Назовите пак");
    expectError(await me.api.post("/api/stickers/packs", { name: "   ", stickers: [{ emoji: "😀" }] }), 400, "Назовите пак");
    expectError(await me.api.post("/api/stickers/packs", { name: "x" }), 400, "Добавьте хотя бы один стикер");
    expectError(await me.api.post("/api/stickers/packs", { name: "x", stickers: [] }), 400, "Добавьте хотя бы один стикер");
    expectError(await me.api.post("/api/stickers/packs", { name: "x", stickers: { emoji: "😀" } }), 400, "Добавьте хотя бы один стикер");
    expect((await me.api.get("/api/stickers/packs")).body.packs).toEqual([]);
  });

  test("картинка — только своя или уже доступная загрузка: чужой неприкреплённый файл и выдуманная ссылка → 400", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const theirs = await uploadedUrl(other, "webp");
    for (const url of [theirs, fakeUploadUrl("webp")]) {
      expectError(
        await me.api.post("/api/stickers/packs", { name: "Чужое", stickers: [{ kind: "image", url }] }),
        400,
        "Некорректная ссылка на файл"
      );
    }
    expect((await me.api.get("/api/stickers/packs")).body.packs).toEqual([]);
    // Чужой файл так и остался недоступен.
    expect((await download(me.api, theirs)).status).toBe(404);

    // Файл из чужого пака (уже доступный всем) — можно.
    const mine = await uploadedUrl(other, "webp");
    expectOk(await other.api.post("/api/stickers/packs", { name: "Их", stickers: [{ kind: "image", url: mine }] }), packBody);
    expectOk(await me.api.post("/api/stickers/packs", { name: "Себе", stickers: [{ kind: "image", url: mine }] }), packBody);
  });

  test("все стикеры некорректны — пак всё равно создаётся пустым", async () => {
    const me = await registerUser(server().baseUrl);
    // ПОВЕДЕНИЕ-ВОПРОС: проверка «хотя бы один стикер» идёт до очистки — пак из одного мусора создаётся пустым.
    const res = expectOk(await me.api.post("/api/stickers/packs", { name: "Пустой", stickers: [null, { name: "x" }] }), packBody);
    expect(res.pack.stickers).toEqual([]);
  });

  test("не больше 60 стикеров — лишние молча отрезаются; паки — по времени создания", async () => {
    const me = await registerUser(server().baseUrl);
    const many = Array.from({ length: 65 }, (_, i) => ({ emoji: "⭐", name: `s${i}` }));
    const first = expectOk(await me.api.post("/api/stickers/packs", { name: "Много", stickers: many }), packBody).pack;
    expect(first.stickers).toHaveLength(60);
    expect(first.stickers.at(-1)).toEqual({ emoji: "⭐", name: "s59" });
    const second = expectOk(await me.api.post("/api/stickers/packs", { name: "Второй", stickers: [{ emoji: "🌙" }] }), packBody).pack;
    expect((await me.api.get("/api/stickers/packs")).body.packs.map((p: any) => p.id)).toEqual([first.id, second.id]);
  });
});

describe("изменение и удаление", () => {
  async function withPack() {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const pack = expectOk(await me.api.post("/api/stickers/packs", { name: "Пак", stickers: [{ emoji: "😀" }] }), packBody).pack;
    return { me, other, pack };
  }

  test("PATCH: только переданные поля; пустое название — остаётся прежним", async () => {
    const { me, pack } = await withPack();
    const renamed = expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { name: "  Новое  " }), packBody).pack;
    expect(renamed).toEqual({ ...pack, name: "Новое" });
    const restickered = expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { name: "   ", stickers: [{ emoji: "🔥", anim: "spin" }, null] }), packBody).pack;
    expect(restickered).toEqual({ ...pack, name: "Новое", stickers: [{ emoji: "🔥", name: "" }] });
    // Пустой список стикеров при изменении — разрешён.
    expect(expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { stickers: [] }), packBody).pack.stickers).toEqual([]);
    expect(expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, {}), packBody).pack.name).toBe("Новое");
  });

  test("PATCH: чужая неприкреплённая загрузка → 400, пак не меняется; прежние стикеры сохраняются повторно", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const img = await uploadedUrl(me, "webp");
    const pack = expectOk(await me.api.post("/api/stickers/packs", { name: "Пак", stickers: [{ kind: "image", url: img }] }), packBody).pack;
    const theirs = await uploadedUrl(other, "webp");
    expectError(
      await me.api.patch(`/api/stickers/packs/${pack.id}`, { stickers: [...pack.stickers, { kind: "image", url: theirs }] }),
      400,
      "Некорректная ссылка на файл"
    );
    expect((await me.api.get("/api/stickers/packs")).body.packs).toEqual([pack]);
    expect(expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { name: "Тот же", stickers: pack.stickers }), packBody).pack).toEqual({ ...pack, name: "Тот же" });
  });

  test("чужой и несуществующий — 404 «Пак не найден», чужой не меняется", async () => {
    const { me, other, pack } = await withPack();
    expectError(await other.api.patch(`/api/stickers/packs/${pack.id}`, { name: "Взлом" }), 404, "Пак не найден");
    expectError(await other.api.delete(`/api/stickers/packs/${pack.id}`), 404, "Пак не найден");
    expectError(await me.api.patch("/api/stickers/packs/sp_nope_000000", { name: "x" }), 404, "Пак не найден");
    expect((await me.api.get("/api/stickers/packs")).body.packs).toEqual([pack]);
  });

  test("DELETE: удаляет; повторно — 404", async () => {
    const { me, pack } = await withPack();
    expectOk(await me.api.delete(`/api/stickers/packs/${pack.id}`), okBody);
    expect((await me.api.get("/api/stickers/packs")).body.packs).toEqual([]);
    expectError(await me.api.delete(`/api/stickers/packs/${pack.id}`), 404, "Пак не найден");
  });
});
