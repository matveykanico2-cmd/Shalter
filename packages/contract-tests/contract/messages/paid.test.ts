// Платный контент: сообщение с paidMedia, GET /:messageId/paid и POST /:messageId/unlock.
// У новых пользователей звёзд нет, поэтому покупка проверяется только на отказах.
import { describe, expect, test } from "vitest";
import { notEnoughStars, paidLocked, paidPlaceholder, paidResult, sendResult, unlockResult } from "../../schemas/messages";
import { uploadResult } from "../../schemas/uploads";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download, upload, uniquePng } from "../uploads/helpers";
import { msgs } from "./helpers";

const server = useServer();

async function photo(user: TestUser) {
  const file = expectOk(await upload(user.api, uniquePng(), { kind: "image", name: "p.png" }), uploadResult);
  return { kind: "image", url: file.url, thumbUrl: file.url, name: "p.png" };
}

describe("платный контент", () => {
  test("в личке: заглушка вместо вложений, автору — всё, собеседнику — 402", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const att = await photo(a);

    const sent = expectOk(
      await a.api.post(msgs(dm.id), { text: "", attachments: [att], paidMedia: { stars: 5, width: 640.4, height: 480, blur: "javascript:x" } }),
      sendResult,
    ).message;
    expect(sent.attachments).toHaveLength(1);
    expect(expectShape(paidPlaceholder, sent.attachments![0]).meta).toEqual({ stars: 5, count: 1, photos: 1, videos: 0, blur: null, width: 640, height: 480 });
    expect(sent).not.toHaveProperty("paidStars");

    expect(expectOk(await a.api.get(msgs(dm.id, `/${sent.id}/paid`)), paidResult)).toEqual({ attachments: [att], buyers: 0 });
    expect(expectOk(await a.api.post(msgs(dm.id, `/${sent.id}/unlock`)), unlockResult)).toEqual({ attachments: [att], balance: 0 });

    const locked = await b.api.get(msgs(dm.id, `/${sent.id}/paid`));
    expect(expectOk(locked, paidLocked, 402)).toEqual({ error: "Пост открывается за звёзды", stars: 5 });
    const unlock = await b.api.post(msgs(dm.id, `/${sent.id}/unlock`));
    expect(expectOk(unlock, notEnoughStars, 402)).toEqual({ error: "Не хватает звёзд: нужно 5 ⭐", needStars: 5, balance: 0 });

    // Настоящий файл по прямой ссылке /uploads/… — только автору (и купившим), не участнику без покупки.
    expect((await download(a.api, att.url)).status).toBe(200);
    expect((await download(b.api, att.url)).status).toBe(404);
    expect((await download(outsider.api, att.url)).status).toBe(404);

    expectError(await outsider.api.get(msgs(dm.id, `/${sent.id}/paid`)), 404, "not found");
    expectError(await outsider.api.post(msgs(dm.id, `/${sent.id}/unlock`)), 404, "not found");
    expectError(await new Api(baseUrl).get(msgs(dm.id, `/${sent.id}/paid`)), 401, "unauthorized");
    expectError(await new Api(baseUrl).post(msgs(dm.id, `/${sent.id}/unlock`)), 401, "unauthorized");

    // Обычное сообщение — платного контента нет.
    const plain = await sendText(a, dm.id, "бесплатно");
    expectError(await a.api.get(msgs(dm.id, `/${plain.id}/paid`)), 404, "not found");
    expectError(await b.api.post(msgs(dm.id, `/${plain.id}/unlock`)), 404, "not found");
    // Платное сообщение из другого чата.
    const other = await createGroup(a, [b]);
    expectError(await a.api.get(msgs(other.id, `/${sent.id}/paid`)), 404, "not found");
  });

  test("ошибки цены и вложений", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const att = await photo(a);
    for (const stars of [0, -1, 10001, "abc", undefined]) {
      expectError(await a.api.post(msgs(dm.id), { text: "x", attachments: [att], paidMedia: { stars } }), 400, "Цена — от 1 до 10000 ⭐");
    }
    expectError(
      await a.api.post(msgs(dm.id), { text: "x", attachments: [{ kind: "dice" }], paidMedia: { stars: 1 } }),
      400,
      "Платным можно сделать только фото или видео",
    );
    expectError(await a.api.post(msgs(dm.id), { text: "x", paidMedia: { stars: 1 } }), 400, "Платным можно сделать только фото или видео");
    // Дробная цена округляется вниз.
    const m = expectOk(await a.api.post(msgs(dm.id), { text: "", attachments: [att], paidMedia: { stars: 7.9 } }), sendResult).message;
    expect((m.attachments![0] as any).meta.stars).toBe(7);
  });

  test("в канале: buyers видят админы; подписчику — 402", async () => {
    const { baseUrl } = server();
    const [owner, sub] = await registerUsers(baseUrl, 2);
    const channel = await createChannel(owner, [sub]);
    const att = await photo(owner);
    const post = expectOk(await owner.api.post(msgs(channel.id), { text: "платный пост", attachments: [att], paidMedia: { stars: 3 } }), sendResult).message;
    expect(expectOk(await owner.api.get(msgs(channel.id, `/${post.id}/paid`)), paidResult)).toEqual({ attachments: [att], buyers: 0 });
    expect(expectOk(await sub.api.get(msgs(channel.id, `/${post.id}/paid`)), paidLocked, 402).stars).toBe(3);
    expect(expectOk(await sub.api.post(msgs(channel.id, `/${post.id}/unlock`)), notEnoughStars, 402)).toEqual({
      error: "Не хватает звёзд: нужно 3 ⭐",
      needStars: 3,
      balance: 0,
    });
    // Прямая ссылка на настоящий файл: подписчику без покупки — нет, автору — да.
    expect((await download(sub.api, att.url)).status).toBe(404);
    expect((await download(owner.api, att.url)).status).toBe(200);
  });

  test("чужой файл платным не сделать: без доступа к файлу — 400", async () => {
    const { baseUrl } = server();
    const [a, b, victim] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const foreign = await photo(victim);
    expectError(
      await a.api.post(msgs(dm.id), { text: "", attachments: [foreign], paidMedia: { stars: 1 } }),
      400,
      "Файл не найден — загрузите его заново",
    );
    expect((await download(a.api, foreign.url)).status).toBe(404);
  });
});
