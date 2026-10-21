// Аватарки профиля (server/routes/avatars.js, lib/avatars.js): до 6 штук, первая —
// главная (её poster становится avatarImage), смена главной и удаление; каждое
// изменение рассылает contact:updated (lib/notifyProfileChanged.js).
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { avatarsChangeBody, avatarsListBody } from "../../schemas/profile";
import { contactUpdated } from "../../schemas/ws";
import { setPrivacy, socketPool } from "../ws/helpers";
import { POSTER, fakeUploadUrl, uploadedUrl } from "../users/helpers";

const server = useServer();
const open = socketPool();

const POSTER2 = "data:image/webp;base64,UklGRg==";

describe("без сессии", () => {
  test.each([
    ["GET", "/api/avatars"],
    ["POST", "/api/avatars"],
    ["POST", "/api/avatars/0/main"],
    ["DELETE", "/api/avatars/0"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("добавление", () => {
  test("новая — первой и главной; kind только image/video; лишние поля отбрасываются", async () => {
    const me = await registerUser(server().baseUrl);
    expect(expectOk(await me.api.get("/api/avatars"), avatarsListBody)).toEqual({ avatars: [], max: 6 });

    const first = await uploadedUrl(me, "mp4", "avatar-video");
    const r1 = expectOk(await me.api.post("/api/avatars", { url: first, poster: POSTER, kind: "video", extra: 1 }), avatarsChangeBody);
    expect(r1.avatars).toEqual([{ url: first, kind: "video", poster: POSTER }]);
    expect(r1.user).toMatchObject({ id: me.id, avatarImage: POSTER, avatarImages: r1.avatars });

    const second = await uploadedUrl(me);
    const r2 = expectOk(await me.api.post("/api/avatars", { url: second, poster: POSTER2, kind: "gif" }), avatarsChangeBody);
    expect(r2.avatars).toEqual([
      { url: second, kind: "image", poster: POSTER2 },
      { url: first, kind: "video", poster: POSTER },
    ]);
    expect(r2.user.avatarImage).toBe(POSTER2);

    expect(expectOk(await me.api.get("/api/avatars"), avatarsListBody).avatars).toEqual(r2.avatars);
    const [other] = await registerUsers(server().baseUrl, 1);
    expect((await other.api.get(`/api/users/${me.id}`)).body.user).toMatchObject({ avatarImage: POSTER2, avatarImages: r2.avatars });
  });

  test("только свой загруженный файл: выдуманная и чужая ссылка — 400", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    // Ссылка выдумана — файла нет.
    expectError(await me.api.post("/api/avatars", { url: fakeUploadUrl(), poster: POSTER }), 400, "Некорректная ссылка на файл");
    // Чужая загрузка.
    const url = await uploadedUrl(me);
    expectError(await other.api.post("/api/avatars", { url, poster: POSTER }), 400, "Некорректная ссылка на файл");
    expectOk(await me.api.post("/api/avatars", { url, poster: POSTER }), avatarsChangeBody);
    expect((await other.api.get("/api/avatars")).body.avatars).toEqual([]);
  });

  const invalid: Array<[string, Record<string, unknown>, string]> = [
    ["без url", { poster: POSTER }, "Некорректная ссылка на файл"],
    ["внешняя ссылка", { url: "https://evil.example/a.png", poster: POSTER }, "Некорректная ссылка на файл"],
    ["выход из каталога", { url: "/uploads/../data/app.db", poster: POSTER }, "Некорректная ссылка на файл"],
    ["data-URL вместо ссылки", { url: POSTER, poster: POSTER }, "Некорректная ссылка на файл"],
    ["без превью", { url: "/uploads/img_0123456789abcdef.png" }, "Нет превью для аватарки"],
    ["превью gif", { url: "/uploads/img_0123456789abcdef.png", poster: "data:image/gif;base64,R0lGOD" }, "Некорректное превью"],
    ["превью ссылкой", { url: "/uploads/img_0123456789abcdef.png", poster: "https://evil.example/p.png" }, "Некорректное превью"],
    ["огромное превью", { url: "/uploads/img_0123456789abcdef.png", poster: `data:image/png;base64,${"A".repeat(400 * 1024)}` }, "Превью слишком большое"],
  ];
  test.each(invalid)("%s → 400", async (_what, body, error) => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/avatars", body), 400, error);
    expect((await me.api.get("/api/avatars")).body.avatars).toEqual([]);
  });

  test("не больше 6 — седьмая 409", async () => {
    const me = await registerUser(server().baseUrl);
    for (let i = 0; i < 6; i++) expectOk(await me.api.post("/api/avatars", { url: await uploadedUrl(me), poster: POSTER }), avatarsChangeBody);
    expectError(await me.api.post("/api/avatars", { url: await uploadedUrl(me), poster: POSTER }), 409, "Больше 6 аватарок не поместится — удалите одну");
    expect((await me.api.get("/api/avatars")).body.avatars).toHaveLength(6);
  });
});

describe("главная и удаление", () => {
  async function withThree() {
    const me = await registerUser(server().baseUrl);
    const urls = [await uploadedUrl(me), await uploadedUrl(me), await uploadedUrl(me)];
    const posters = [POSTER, POSTER2, "data:image/jpeg;base64,/9j/"];
    for (let i = 0; i < 3; i++) await me.api.post("/api/avatars", { url: urls[i], poster: posters[i] });
    // Порядок после добавления — обратный: последняя добавленная первая.
    return { me, urls: urls.reverse(), posters: posters.reverse() };
  }

  test("POST /:index/main переносит в начало, остальные — по порядку", async () => {
    const { me, urls, posters } = await withThree();
    const res = expectOk(await me.api.post("/api/avatars/2/main"), avatarsChangeBody);
    expect(res.avatars.map((a) => a.url)).toEqual([urls[2], urls[0], urls[1]]);
    expect(res.user.avatarImage).toBe(posters[2]);
    // Уже главная — без изменений.
    expect(expectOk(await me.api.post("/api/avatars/0/main"), avatarsChangeBody).avatars.map((a) => a.url)).toEqual([urls[2], urls[0], urls[1]]);
  });

  test("DELETE /:index убирает одну; последнюю — avatarImage пропадает", async () => {
    const { me, urls, posters } = await withThree();
    const res = expectOk(await me.api.delete("/api/avatars/0"), avatarsChangeBody);
    expect(res.avatars.map((a) => a.url)).toEqual([urls[1], urls[2]]);
    expect(res.user.avatarImage).toBe(posters[1]);
    await me.api.delete("/api/avatars/1");
    const last = expectOk(await me.api.delete("/api/avatars/0"), avatarsChangeBody);
    expect(last.avatars).toEqual([]);
    expect(last.user).not.toHaveProperty("avatarImage");
    expect((await me.api.get(`/api/users/${me.id}`)).body.user).not.toHaveProperty("avatarImage");
  });

  test.each(["3", "-1", "1.5", "abc"])("индекс %s → 404 «Аватарка не найдена»", async (index) => {
    const { me } = await withThree();
    expectError(await me.api.post(`/api/avatars/${index}/main`), 404, "Аватарка не найдена");
    expectError(await me.api.delete(`/api/avatars/${index}`), 404, "Аватарка не найдена");
    expect((await me.api.get("/api/avatars")).body.avatars).toHaveLength(3);
  });

  test("без аватарок — 404", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/avatars/0/main"), 404, "Аватарка не найдена");
    expectError(await me.api.delete("/api/avatars/0"), 404, "Аватарка не найдена");
  });
});

describe("contact:updated", () => {
  test("добавление, смена главной и удаление — себе и собеседнику; при photo = nobody собеседник фото не получает", async () => {
    const { baseUrl } = server();
    const [me, peer, outsider] = await registerUsers(baseUrl, 3);
    await createDm(peer, me);
    const [meWs, peerWs, outsiderWs] = await Promise.all([open(me.api), open(peer.api), open(outsider.api)]);

    const url = await uploadedUrl(me);
    await me.api.post("/api/avatars", { url, poster: POSTER });
    const self = expectShape(contactUpdated, await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "себе").user;
    expect(self.avatarImage).toBe(POSTER);
    const forPeer = expectShape(contactUpdated, await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "собеседнику").user;
    expect(forPeer).toMatchObject({ avatarImage: POSTER, avatarImages: [{ url, kind: "image", poster: POSTER }] });

    await setPrivacy(me, { photo: "nobody" });
    meWs.clear();
    peerWs.clear();
    await me.api.post("/api/avatars", { url: await uploadedUrl(me), poster: POSTER2 });
    expect((await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000)).user.avatarImage).toBe(POSTER2);
    const hidden = (await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000)).user;
    expect(hidden).not.toHaveProperty("avatarImage");
    expect(hidden).not.toHaveProperty("avatarImages");

    for (const action of [() => me.api.post("/api/avatars/1/main"), () => me.api.delete("/api/avatars/0")]) {
      meWs.clear();
      expect((await action()).status).toBe(200);
      await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000);
    }
    await outsiderWs.expectNone("contact:updated", (e) => e.user?.id === me.id, 500);
  });

  test("ошибка проверки — событий нет", async () => {
    const me = await registerUser(server().baseUrl);
    const ws = await open(me.api);
    expectError(await me.api.post("/api/avatars", { url: "bad", poster: POSTER }), 400, "Некорректная ссылка на файл");
    expectError(await me.api.delete("/api/avatars/0"), 404, "Аватарка не найдена");
    await ws.expectNone("contact:updated", () => true, 500);
  });
});
