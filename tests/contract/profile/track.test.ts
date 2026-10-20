// Музыка в профиле (server/routes/profileTrack.js): список до 20 треков, первый —
// основной (profileTrack), весь список — profileTracks в publicUser.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { profileTrack, profileTrackBody } from "../../schemas/profile";
import { otherProfileBody } from "../../schemas/users";
import { contactUpdated } from "../../schemas/ws";
import { socketPool } from "../ws/helpers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";

const server = useServer();
const open = socketPool();

const tracksOf = (body: any) => expectShape(z.array(profileTrack), body.user.profileTracks, "profileTracks");

describe("без сессии", () => {
  test.each([
    ["POST", "/api/profile-track"],
    ["POST", "/api/profile-track/0/main"],
    ["DELETE", "/api/profile-track/0"],
    ["DELETE", "/api/profile-track"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    expectError(await new Api(server().baseUrl).request(method, path, { json: {} }), 401, "unauthorized");
  });
});

describe("POST /api/profile-track", () => {
  test("новый — первым и основным; поля нормализуются; виден другим", async () => {
    const [me, viewer] = await registerUsers(server().baseUrl, 2);
    const [mp3, ogg, third] = [await uploadedUrl(me, "mp3", "profile-track"), await uploadedUrl(me, "ogg", "profile-track"), await uploadedUrl(me, "mp3", "profile-track")];
    const res = expectOk(
      await me.api.post("/api/profile-track", { url: mp3, name: 42, size: 1234, mimeType: "audio/mpeg", duration: 3.6, extra: 1 }),
      profileTrackBody
    );
    const first = { url: mp3, name: "42", size: 1234, mimeType: "audio/mpeg", duration: 4, at: expect.any(String) };
    expect(tracksOf(res)).toEqual([first]);
    expect(res.user.profileTrack).toEqual(first);

    // Без имени — «Трек»; некорректные size/duration — без ключа; длинные строки обрезаются.
    const res2 = expectOk(
      await me.api.post("/api/profile-track", { url: ogg, size: "10", duration: -5, mimeType: "m".repeat(200) }),
      profileTrackBody
    );
    expect(tracksOf(res2)[0]).toEqual({ url: ogg, name: "Трек", mimeType: "m".repeat(120), at: expect.any(String) });
    expect(tracksOf(res2)[1]).toEqual(first);
    expect((await me.api.post("/api/profile-track", { url: third, name: "н".repeat(300) })).body.user.profileTrack.name).toHaveLength(200);

    const seen = expectOk(await viewer.api.get(`/api/users/${me.id}`), otherProfileBody).user;
    expect(seen.profileTracks).toHaveLength(3);
    expect(seen.profileTrack).toMatchObject({ url: third });
  });

  test("повторная ссылка не дублируется — трек переезжает в начало с новыми полями", async () => {
    const me = await registerUser(server().baseUrl);
    const [a, b] = [await uploadedUrl(me, "mp3", "profile-track"), await uploadedUrl(me, "mp3", "profile-track")];
    await me.api.post("/api/profile-track", { url: a, name: "A" });
    await me.api.post("/api/profile-track", { url: b, name: "B" });
    const res = expectOk(await me.api.post("/api/profile-track", { url: a, name: "A2" }), profileTrackBody);
    expect(tracksOf(res).map((t) => [t.url, t.name])).toEqual([[a, "A2"], [b, "B"]]);
  });

  test.each([undefined, "", 5, "https://evil.example/a.mp3", "uploads/a.mp3", "data:audio/mpeg;base64,AA=="])("url %s → 400", async (url) => {
    const me = await registerUser(server().baseUrl);
    expectError(await me.api.post("/api/profile-track", { url, name: "x" }), 400, "Загрузите файл через /api/uploads и передайте полученную ссылку");
  });

  test("только свой загруженный файл: «..», выдуманный и чужой — 400", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const error = "Загрузите файл через /api/uploads и передайте полученную ссылку";
    expectError(await me.api.post("/api/profile-track", { url: "/uploads/../../data/app.db" }), 400, error);
    expectError(await me.api.post("/api/profile-track", { url: fakeUploadUrl("mp3") }), 400, error);
    const theirs = await uploadedUrl(other, "mp3", "profile-track");
    expectError(await me.api.post("/api/profile-track", { url: theirs }), 400, error);
    expect((await me.api.get(`/api/users/${me.id}`)).body.user.profileTracks ?? []).toEqual([]);
  });

  test("не больше 20 — двадцать первый 400", async () => {
    const me = await registerUser(server().baseUrl);
    const urls: string[] = [];
    for (let i = 0; i < 21; i++) urls.push(await uploadedUrl(me, "mp3", "profile-track"));
    for (let i = 0; i < 20; i++) expect((await me.api.post("/api/profile-track", { url: urls[i] })).status).toBe(200);
    expectError(await me.api.post("/api/profile-track", { url: urls[20] }), 400, "Не больше 20 треков в профиле");
    // Повторно уже существующий — можно (список не растёт).
    expect((await me.api.post("/api/profile-track", { url: urls[0] })).status).toBe(200);
  });
});

describe("основной, удаление", () => {
  async function withThree() {
    const me = await registerUser(server().baseUrl);
    const [a, b, c] = [await uploadedUrl(me, "mp3", "profile-track"), await uploadedUrl(me, "mp3", "profile-track"), await uploadedUrl(me, "mp3", "profile-track")];
    for (const u of [c, b, a]) expect((await me.api.post("/api/profile-track", { url: u })).status).toBe(200);
    return { me, a, b, c }; // порядок: a, b, c
  }

  test("POST /:index/main — в начало", async () => {
    const { me, a, b, c } = await withThree();
    const res = expectOk(await me.api.post("/api/profile-track/2/main"), profileTrackBody);
    expect(tracksOf(res).map((t) => t.url)).toEqual([c, a, b]);
    expect(expectShape(profileTrack, res.user.profileTrack, "profileTrack").url).toBe(c);
  });

  test("DELETE /:index — один; DELETE / — все", async () => {
    const { me, b, c } = await withThree();
    expect(tracksOf(expectOk(await me.api.delete("/api/profile-track/0"), profileTrackBody)).map((t) => t.url)).toEqual([b, c]);
    const all = expectOk(await me.api.delete("/api/profile-track"), profileTrackBody);
    expect(all.user).toMatchObject({ profileTrack: null, profileTracks: [] });
    // Повторно — тоже 200.
    expectOk(await me.api.delete("/api/profile-track"), profileTrackBody);
  });

  test.each(["3", "-1", "1.5", "x"])("индекс %s → 404 «Трек не найден»", async (index) => {
    const { me } = await withThree();
    expectError(await me.api.post(`/api/profile-track/${index}/main`), 404, "Трек не найден");
    expectError(await me.api.delete(`/api/profile-track/${index}`), 404, "Трек не найден");
  });
});

test("изменения музыки рассылаются contact:updated — себе и собеседникам, не посторонним", async () => {
  const [me, peer, outsider] = await registerUsers(server().baseUrl, 3);
  await createDm(peer, me);
  const [meWs, peerWs, outsiderWs] = await Promise.all([open(me.api), open(peer.api), open(outsider.api)]);
  const url = await uploadedUrl(me, "mp3", "profile-track");
  expect((await me.api.post("/api/profile-track", { url })).status).toBe(200);
  const self = expectShape(contactUpdated, await meWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "себе").user;
  expect(self).toMatchObject({ profileTrack: { url } });
  const forPeer = expectShape(contactUpdated, await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id, 10_000), "собеседнику").user;
  expect(forPeer).toMatchObject({ profileTrack: { url } });
  await outsiderWs.expectNone("contact:updated", (e) => e.user?.id === me.id, 500);

  peerWs.clear();
  expectOk(await me.api.delete("/api/profile-track"), profileTrackBody);
  expect((await peerWs.waitFor("contact:updated", (e) => e.user?.id === me.id && e.user.profileTrack == null, 10_000)).user.profileTracks).toEqual([]);
});
