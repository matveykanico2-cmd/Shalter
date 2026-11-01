// Стикерпаки (/api/stickers/packs): пак создаётся пустым (название, описание), стикеры —
// отдельными строками (файл PNG/WebP из /api/uploads + эмодзи), чужой пак открывается по id
// и добавляется себе в коллекцию. Менять пак и его стикеры может только владелец.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createDm, registerUser, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { packBody, packsListBody } from "../../schemas/stickers";
import { uploadedUrl } from "../users/helpers";

const server = useServer();
const PACKS = "/api/stickers/packs";

async function newPack(user: TestUser, body: Record<string, unknown> = { name: "Коты" }) {
  return expectOk(await user.api.post(PACKS, body), packBody).pack;
}

async function addSticker(user: TestUser, packId: string, emoji = "🐱") {
  const file = await uploadedUrl(user, "webp");
  const res = await user.api.post(`${PACKS}/${packId}/stickers`, { file, emoji });
  expect(res.status, res.text).toBe(200);
  return { file, sticker: res.body.sticker };
}

describe("без сессии", () => {
  test.each([
    ["GET", PACKS],
    ["POST", PACKS],
    ["GET", `${PACKS}/sp_x_y`],
    ["PATCH", `${PACKS}/sp_x_y`],
    ["DELETE", `${PACKS}/sp_x_y`],
    ["POST", `${PACKS}/sp_x_y/stickers`],
    ["POST", `${PACKS}/sp_x_y/collection`],
  ])("%s %s → 401", async (method, path) => {
    expectError(await new Api(server().baseUrl).request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("свой пак", () => {
  test("создание: название обрезается, описание необязательно; стикеры добавляются по одному", async () => {
    const me = await registerUser(server().baseUrl);
    expect(expectOk(await me.api.get(PACKS), packsListBody).packs).toEqual([]);

    const pack = await newPack(me, { name: `  ${"П".repeat(70)}  `, description: "Пушистые" });
    expect(pack).toMatchObject({ ownerId: me.id, name: "П".repeat(60), description: "Пушистые", stickers: [], stickerCount: 0, isOwner: true });

    const { file, sticker } = await addSticker(me, pack.id, "😺");
    expect(sticker).toMatchObject({ packId: pack.id, url: file, emoji: "😺", position: 0 });
    const listed = expectOk(await me.api.get(PACKS), packsListBody).packs;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: pack.id, stickerCount: 1, stickers: [{ id: sticker.id, url: file }] });
  });

  test("ошибки: без названия; файл не из загрузок или не PNG/WebP", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post(PACKS, { name: "  " }), 400, "Назовите пак");
    const pack = await newPack(me);
    expectError(await me.api.post(`${PACKS}/${pack.id}/stickers`, { file: "https://evil.example/x.webp", emoji: "😀" }), 400);
    const gif = await uploadedUrl(me, "gif");
    expectError(await me.api.post(`${PACKS}/${pack.id}/stickers`, { file: gif, emoji: "😀" }), 400);
    expect(expectOk(await me.api.get(`${PACKS}/${pack.id}`), packBody).pack.stickerCount).toBe(0);
  });

  test("чужой неприкреплённый файл в стикер не добавить — иначе его увидел бы любой", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const theirs = await uploadedUrl(other, "webp");
    const pack = await newPack(me);
    expectError(await me.api.post(`${PACKS}/${pack.id}/stickers`, { file: theirs, emoji: "😀" }), 400, "Некорректная ссылка на файл");
    expect((await download(me.api, theirs)).status).toBe(404);
  });

  test("менять и удалять пак и стикеры может только владелец", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const pack = await newPack(me);
    const { sticker } = await addSticker(me, pack.id);
    expectError(await other.api.patch(`${PACKS}/${pack.id}`, { name: "Чужое" }), 404, "Пак не найден");
    expectError(await other.api.post(`${PACKS}/${pack.id}/stickers`, { file: await uploadedUrl(other, "webp"), emoji: "😀" }), 404, "Пак не найден");
    expectError(await other.api.delete(`${PACKS}/${pack.id}/stickers/${sticker.id}`), 404);
    expectError(await other.api.delete(`${PACKS}/${pack.id}`), 404, "Пак не найден");

    const renamed = expectOk(await me.api.patch(`${PACKS}/${pack.id}`, { description: "Новое" }), packBody).pack;
    expect(renamed).toMatchObject({ name: "Коты", description: "Новое" });
    expect((await me.api.delete(`${PACKS}/${pack.id}`)).status).toBe(200);
    expectError(await me.api.get(`${PACKS}/${pack.id}`), 404, "Пак не найден");
  });
});

describe("чужой пак: окно и коллекция", () => {
  test("открывается по id, картинки видны; «добавить» и «убрать» из своей коллекции", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const pack = await newPack(owner, { name: "Коты", description: "Пушистые" });
    const { file } = await addSticker(owner, pack.id);

    const seen = expectOk(await other.api.get(`${PACKS}/${pack.id}`), packBody).pack;
    expect(seen).toMatchObject({ id: pack.id, isOwner: false, isAdded: false, stickerCount: 1, description: "Пушистые" });
    // Картинка стикера из чужого пака открывается — иначе окно пака пустое.
    expect((await download(other.api, file)).status).toBe(200);

    expect((await other.api.post(`${PACKS}/${pack.id}/collection`)).status).toBe(200);
    const mine = expectOk(await other.api.get(PACKS), packsListBody).packs;
    expect(mine.map((p) => [p.id, p.isAdded, p.isOwner])).toEqual([[pack.id, true, false]]);

    expect((await other.api.delete(`${PACKS}/${pack.id}/collection`)).status).toBe(200);
    expect(expectOk(await other.api.get(PACKS), packsListBody).packs).toEqual([]);
  });

  test("стикер в сообщении хранит packId — по нему собеседник открывает пак", async () => {
    const [owner, other] = await registerUsers(server().baseUrl, 2);
    const pack = await newPack(owner);
    const { file } = await addSticker(owner, pack.id);
    const chat = await createDm(owner, other);
    const sent = await sendText(owner, chat.id, "", { sticker: { kind: "image", url: file, emoji: "🐱", packId: pack.id } });
    expect(sent.sticker).toMatchObject({ kind: "image", url: file, packId: pack.id });
    expect(expectOk(await other.api.get(`${PACKS}/${sent.sticker.packId}`), packBody).pack.id).toBe(pack.id);
  });
});
