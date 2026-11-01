// Стикерпаки (server/routes/stickers.js, data/stickerPacks.js,
// lib/sanitizeSticker.js): стикеры трёх видов (эмодзи, картинка из загрузок,
// нарисованная сцена) — с очисткой. Меняет пак только владелец; любой вошедший
// открывает пак по id и может добавить его себе (как в Telegram).
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createDm, registerUser, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { okBody } from "../../schemas/common";
import { packBody, packsListBody, packViewBody } from "../../schemas/stickers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";

const server = useServer();

describe("без сессии", () => {
  test.each([
    ["GET", "/api/stickers/packs"],
    ["POST", "/api/stickers/packs"],
    ["PATCH", "/api/stickers/packs/sp_x_y"],
    ["DELETE", "/api/stickers/packs/sp_x_y"],
    ["GET", "/api/stickers/packs/sp_x_y"],
    ["POST", "/api/stickers/packs/sp_x_y/install"],
    ["DELETE", "/api/stickers/packs/sp_x_y/install"],
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
        // uid — метка стикера (по ней в ленте открывается его пак); сервер выдаёт, если не прислали.
        { emoji: "😀", name: "улыбка", scene: "party", uid: expect.stringMatching(/^st_[0-9a-f]{8}$/) },
        { emoji: "🔥", name: "", uid: expect.any(String) },
        { kind: "image", url: img, emoji: "🖼️", name: "", animated: true, uid: expect.any(String) },
        {
          kind: "custom",
          emoji: "🎈",
          name: "",
          uid: expect.any(String),
          scene: {
            v: 1,
            loop: 12,
            bg: "#fff",
            layers: [{ type: "circle", x: 50, y: 50, fill: "#ff8a3d", opacity: 1, rot: 0, anim: "none", delay: 0, dur: 1.6, r: 50 }],
          },
        },
      ],
      createdAt: expect.any(String),
      description: "",
    });

    expect(expectOk(await me.api.get("/api/stickers/packs"), packsListBody).packs).toEqual([res.pack]);
    // Чужие паки в списке не появляются, пока их не добавили себе.
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

  test("все стикеры некорректны — 400, пак не создаётся", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/stickers/packs", { name: "Пустой", stickers: [null, { name: "x" }] }), 400, "Добавьте хотя бы один стикер");
    expect((await me.api.get("/api/stickers/packs")).body.packs).toEqual([]);
  });

  test("не больше 60 стикеров — лишние молча отрезаются; паки — по времени создания", async () => {
    const me = await registerUser(server().baseUrl);
    const many = Array.from({ length: 65 }, (_, i) => ({ emoji: "⭐", name: `s${i}` }));
    const first = expectOk(await me.api.post("/api/stickers/packs", { name: "Много", stickers: many }), packBody).pack;
    expect(first.stickers).toHaveLength(60);
    expect(first.stickers.at(-1)).toEqual({ emoji: "⭐", name: "s59", uid: expect.any(String) });
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
    expect(restickered).toEqual({ ...pack, name: "Новое", stickers: [{ emoji: "🔥", name: "", uid: expect.any(String) }] });
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

describe("описание пака", () => {
  test("задаётся при создании и в PATCH, обрезается до 200; без поля в PATCH — прежнее", async () => {
    const me = await registerUser(server().baseUrl);
    const { pack } = expectOk(await me.api.post("/api/stickers/packs", { name: "Коты", description: `  ${"о".repeat(250)} `, stickers: [{ emoji: "🐱" }] }), packBody);
    expect(pack.description).toBe("о".repeat(200));
    expect(expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { name: "Коты 2" }), packBody).pack.description).toBe("о".repeat(200));
    expect(expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { description: "Пушистые" }), packBody).pack.description).toBe("Пушистые");
    expect(expectOk(await me.api.patch(`/api/stickers/packs/${pack.id}`, { description: null }), packBody).pack.description).toBe("");
  });
});

describe("окно пака и добавление себе", () => {
  test("любой вошедший открывает пак по id; installed — свой или добавленный", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const { pack } = expectOk(await owner.api.post("/api/stickers/packs", { name: "Коты", description: "Пушистые", stickers: [{ emoji: "🐱" }] }), packBody);
    expect(expectOk(await owner.api.get(`/api/stickers/packs/${pack.id}`), packViewBody)).toEqual({ pack, installed: true });
    expect(expectOk(await other.api.get(`/api/stickers/packs/${pack.id}`), packViewBody)).toEqual({ pack, installed: false });
    expectError(await other.api.get("/api/stickers/packs/sp_nope_x"), 404, "Пак не найден");
    expectError(await other.api.get("/api/stickers/packs/..%2Fx"), 404, "Пак не найден");
  });

  test("добавить себе: пак появляется в списке после своих; повтор — без дублей; удалить — пропадает", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const { pack } = expectOk(await owner.api.post("/api/stickers/packs", { name: "Коты", stickers: [{ emoji: "🐱" }] }), packBody);
    const { pack: mine } = expectOk(await other.api.post("/api/stickers/packs", { name: "Мой", stickers: [{ emoji: "🙂" }] }), packBody);

    expect(expectOk(await other.api.post(`/api/stickers/packs/${pack.id}/install`), packViewBody)).toEqual({ pack, installed: true });
    expectOk(await other.api.post(`/api/stickers/packs/${pack.id}/install`), packViewBody);
    expect(expectOk(await other.api.get("/api/stickers/packs"), packsListBody).packs).toEqual([mine, pack]);
    expect(expectOk(await other.api.get(`/api/stickers/packs/${pack.id}`), packViewBody).installed).toBe(true);
    // Владелец свой пак себе не добавляет.
    expectError(await owner.api.post(`/api/stickers/packs/${pack.id}/install`), 400, "Это ваш пак — он уже у вас");
    expectError(await other.api.post("/api/stickers/packs/sp_nope_x/install"), 404, "Пак не найден");

    // Добавивший пак не меняет и не удаляет его.
    expectError(await other.api.patch(`/api/stickers/packs/${pack.id}`, { name: "Чужое" }), 404, "Пак не найден");
    expectError(await other.api.delete(`/api/stickers/packs/${pack.id}`), 404, "Пак не найден");

    expectOk(await other.api.delete(`/api/stickers/packs/${pack.id}/install`), okBody);
    expectOk(await other.api.delete(`/api/stickers/packs/${pack.id}/install`), okBody);
    expect(expectOk(await other.api.get("/api/stickers/packs"), packsListBody).packs).toEqual([mine]);
  });

  test("владелец удалил пак — у добавивших он пропадает", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const { pack } = expectOk(await owner.api.post("/api/stickers/packs", { name: "Коты", stickers: [{ emoji: "🐱" }] }), packBody);
    expectOk(await other.api.post(`/api/stickers/packs/${pack.id}/install`), packViewBody);
    expectOk(await owner.api.delete(`/api/stickers/packs/${pack.id}`), okBody);
    expect(expectOk(await other.api.get("/api/stickers/packs"), packsListBody).packs).toEqual([]);
  });

  test("стикер в сообщении хранит packId, только если он из этого пака", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const img = await uploadedUrl(owner, "webp");
    const { pack } = expectOk(await owner.api.post("/api/stickers/packs", { name: "Коты", stickers: [{ kind: "image", url: img }, { emoji: "🐱" }] }), packBody);
    const [imageSticker, emojiSticker] = pack.stickers as { uid: string }[];
    const chat = await createDm(owner, other);

    const sent = await sendText(owner, chat.id, "", { sticker: { ...imageSticker, packId: pack.id } });
    expect(sent.sticker).toEqual({ kind: "image", url: img, emoji: "🖼️", name: "", packId: pack.id });
    const byUid = await sendText(owner, chat.id, "", { sticker: { ...emojiSticker, packId: pack.id } });
    expect(byUid.sticker).toEqual({ emoji: "🐱", name: "", packId: pack.id });

    // Стикера нет в паке, пака нет, мусор вместо id — packId отбрасывается, стикер остаётся.
    const { pack: otherPack } = expectOk(await other.api.post("/api/stickers/packs", { name: "Их", stickers: [{ emoji: "🐶" }] }), packBody);
    expect((await sendText(owner, chat.id, "", { sticker: { emoji: "🐱", packId: otherPack.id } })).sticker).toEqual({ emoji: "🐱", name: "" });
    expect((await sendText(owner, chat.id, "", { sticker: { emoji: "🐱", packId: "sp_nope_x" } })).sticker).toEqual({ emoji: "🐱", name: "" });
    expect((await sendText(owner, chat.id, "", { sticker: { emoji: "🐱", packId: { $ne: 1 } } })).sticker).toEqual({ emoji: "🐱", name: "" });

    // Собеседник открывает пак по стикеру и видит картинку из него.
    expect(expectOk(await other.api.get(`/api/stickers/packs/${pack.id}`), packViewBody).pack.id).toBe(pack.id);
    expect((await download(other.api, img)).status).toBe(200);
  });
});
