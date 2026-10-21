// Что показывает профиль помимо полей пользователя (server/routes/users.js):
// закреплённые каналы (/me/pinnable-channels, /me/pinned-channels, pinnedChannels
// в GET /:id), общие группы (/:id/common-chats, commonGroupsCount) и общие
// медиа личного чата (/:id/shared-media).
import { describe, expect, test } from "vitest";
import { expectOk } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, registerUsers, sendText, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { commonChatsBody, otherProfileBody, pinnableChannelsBody, pinnedChannelsBody, sharedMediaBody } from "../../schemas/users";

const server = useServer();
const pin = (user: TestUser, body: unknown) => user.api.request("PUT", "/api/users/me/pinned-channels", { json: body });

describe("закреплённые каналы", () => {
  test("закрепить можно только публичные каналы, где ты владелец/админ; дубли и мусор отбрасываются", async () => {
    const { baseUrl } = server();
    const [me, member, viewer] = await registerUsers(baseUrl, 3);
    const pub = await createChannel(me, [member], { isPublic: true, username: uniq("pub"), title: "Публичный" });
    const priv = await createChannel(me, [], { title: "Закрытый" });
    const group = await createGroup(me, [member], { isPublic: true, username: uniq("grp") });
    const foreign = await createChannel(member, [me], { isPublic: true, username: uniq("foreign") });

    const pinnable = expectOk(await me.api.get("/api/users/me/pinnable-channels"), pinnableChannelsBody);
    expect(pinnable.channels).toEqual([
      { id: pub.id, title: "Публичный", username: pub.username, avatarColor: expect.any(String), avatarImage: null, isVerified: false, members: 2, isMember: true },
    ]);

    const pinned = expectOk(
      await pin(me, { chatIds: [pub.id, pub.id, priv.id, group.id, foreign.id, 42, null] }),
      pinnedChannelsBody
    );
    expect(pinned.pinnedChannels.map((c) => c.id)).toEqual([pub.id]);
    // Записано в настройки.
    expect((await me.api.get("/api/settings")).body.settings.pinnedChannelIds).toEqual([pub.id]);

    // Другим — в профиле, isMember — с их точки зрения.
    const seen = expectOk(await viewer.api.get(`/api/users/${me.id}`), otherProfileBody);
    expect(seen.pinnedChannels).toEqual([{ ...pinned.pinnedChannels[0], isMember: false }]);
    expect((await member.api.get(`/api/users/${me.id}`)).body.pinnedChannels[0].isMember).toBe(true);

    // Без chatIds — снять все.
    expect(expectOk(await pin(me, {}), pinnedChannelsBody)).toEqual({ pinnedChannels: [] });
    expect((await viewer.api.get(`/api/users/${me.id}`)).body.pinnedChannels).toEqual([]);
  });

  test("не больше 6; через /api/settings не записываются", async () => {
    const { baseUrl } = server();
    const [me, viewer] = await registerUsers(baseUrl, 2);
    const channels = [];
    for (let i = 0; i < 7; i++) channels.push(await createChannel(me, [], { isPublic: true, username: uniq("ch"), title: `К${i}` }));
    const ids = channels.map((c) => c.id);
    const pinned = expectOk(await pin(me, { chatIds: ids }), pinnedChannelsBody).pinnedChannels;
    expect(pinned.map((c) => c.id)).toEqual(ids.slice(0, 6));

    // pinnedChannelIds — служебный ключ: PATCH /api/settings его не меняет.
    await me.api.patch("/api/settings", { pinnedChannelIds: ["c_fake0000000", ids[6]] });
    expect((await viewer.api.get(`/api/users/${me.id}`)).body.pinnedChannels.map((c: any) => c.id)).toEqual(ids.slice(0, 6));
  });
});

describe("общие группы", () => {
  test("только группы, где состоят оба; каналы и личка не считаются; себе — пусто", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const shared = await createGroup(a, [b], { title: "Общая" });
    await createGroup(a, [c], { title: "Без b" });
    await createChannel(a, [b]);
    await createDm(a, b);

    const res = expectOk(await a.api.get(`/api/users/${b.id}/common-chats`), commonChatsBody);
    expect(res.chats).toEqual([{ id: shared.id, title: "Общая", avatarColor: expect.any(String), avatarImage: null, members: 2 }]);
    expect((await b.api.get(`/api/users/${a.id}/common-chats`)).body.chats.map((x: any) => x.id)).toEqual([shared.id]);
    expect((await a.api.get(`/api/users/${b.id}`)).body.commonGroupsCount).toBe(1);
    expect(expectOk(await a.api.get(`/api/users/${a.id}/common-chats`), commonChatsBody)).toEqual({ chats: [] });
    expect((await a.api.get(`/api/users/${a.id}`)).body.commonGroupsCount).toBe(0);
    // Несуществующий — пустой список, не 404.
    expect((await a.api.get("/api/users/u_nonexistent00/common-chats")).body).toEqual({ chats: [] });
  });
});

describe("общие медиа", () => {
  test("вложения личного чата по видам, ссылки, новые — первыми; без лички и себе — пусто", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const empty = { chatId: null, media: [], files: [], links: [], voice: [] };
    expect(expectOk(await a.api.get(`/api/users/${b.id}/shared-media`), sharedMediaBody)).toEqual(empty);
    expect((await a.api.get(`/api/users/${a.id}/shared-media`)).body).toEqual(empty);

    const dm = await createDm(a, b);
    const link = await sendText(a, dm.id, "смотри http://127.0.0.1/page");
    await sendText(a, dm.id, "просто текст");
    const image = { kind: "image", url: "data:image/png;base64,AAAA", size: 10 };
    const video = { kind: "video", url: "data:video/mp4;base64,AAAA" };
    const file = { kind: "file", url: "data:text/plain;base64,AAAA", name: "f.txt" };
    const voice = { kind: "voice", url: "data:audio/ogg;base64,AAAA", durationSec: 2 };
    const first = await sendText(b, dm.id, "", { attachments: [image, file] });
    const second = await sendText(a, dm.id, "", { attachments: [video, voice] });

    // Превью ссылки дописывается к сообщению асинхронно (routes/messages.js) — ждём его.
    let res = expectOk(await b.api.get(`/api/users/${a.id}/shared-media`), sharedMediaBody);
    for (let i = 0; i < 100 && !res.links[0]?.linkPreview; i++) {
      await new Promise((r) => setTimeout(r, 100));
      res = expectOk(await b.api.get(`/api/users/${a.id}/shared-media`), sharedMediaBody);
    }
    expect(res.chatId).toBe(dm.id);
    expect(res.media).toEqual([
      { messageId: second.id, createdAt: second.createdAt, senderId: a.id, attachment: video },
      { messageId: first.id, createdAt: first.createdAt, senderId: b.id, attachment: image },
    ]);
    expect(res.files).toEqual([{ messageId: first.id, createdAt: first.createdAt, senderId: b.id, attachment: file }]);
    expect(res.voice).toEqual([{ messageId: second.id, createdAt: second.createdAt, senderId: a.id, attachment: voice }]);
    // Превью ссылки на 127.0.0.1 не скачивается (lib/linkPreview.js не ходит на частные адреса) — только url и флаги.
    expect(res.links).toEqual([
      { messageId: link.id, createdAt: link.createdAt, text: link.text, linkPreview: { url: "http://127.0.0.1/page", unsafe: true, warning: "Небезопасное соединение (не https)" } },
    ]);
    // С другой стороны — тот же чат.
    expect((await a.api.get(`/api/users/${b.id}/shared-media`)).body.chatId).toBe(dm.id);
    // Посторонний с a лички не имеет — пусто.
    expect((await c.api.get(`/api/users/${a.id}/shared-media`)).body).toEqual(empty);
  });

  test("очистка истории у себя скрывает старые медиа только себе", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "", { attachments: [{ kind: "image", url: "data:image/png;base64,AAAA" }] });
    const clear = await a.api.post(`/api/chats/${dm.id}/clear`, {});
    expect(clear.status, clear.text).toBe(200);
    expect((await a.api.get(`/api/users/${b.id}/shared-media`)).body.media).toEqual([]);
    expect((await b.api.get(`/api/users/${a.id}/shared-media`)).body.media).toHaveLength(1);
  });
});

test("регистрация одного пользователя не ломает /me-маршруты (me — не id)", async () => {
  const me = await registerUser(server().baseUrl);
  expect(expectOk(await me.api.get("/api/users/me/pinnable-channels"), pinnableChannelsBody)).toEqual({ channels: [], max: 6 });
});
