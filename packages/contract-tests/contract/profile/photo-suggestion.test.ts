// «Предложить фото профиля», как в Telegram: одно фото в личке с флагом photoSuggestion,
// получатель ставит его на аватарку (POST /api/avatars/from-suggestion). Аватаркой
// становится своя копия получателя: файл из лички виден только её участникам, а аватарку
// видят все.
import { describe, expect, test } from "vitest";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { avatarsChangeBody } from "../../schemas/profile";
import { POSTER } from "../users/helpers";
import { download, upload, uniquePng } from "../uploads/helpers";

const server = useServer();

async function photo(user: TestUser): Promise<string> {
  const res = await upload(user.api, uniquePng(4), { kind: "image", name: "p.png" });
  expect(res.status, res.text).toBe(200);
  return res.body.url;
}

async function suggest(from: TestUser, chatId: string, extra: Record<string, unknown> = {}) {
  const url = await photo(from);
  return sendText(from, chatId, "", { attachments: [{ kind: "image", url, name: "p.png" }], photoSuggestion: true, ...extra });
}

describe("предложить фото профиля", () => {
  test("в личке сообщение помечено photoSuggestion, получатель ставит фото на аватарку", async () => {
    const [alice, bob, carol] = await registerUsers(server().baseUrl, 3);
    const dm = await createDm(alice, bob);
    const message = await suggest(alice, dm.id);
    expect(message.photoSuggestion).toBe(true);
    const history = (await bob.api.get(`/api/chats/${dm.id}/messages`)).body.messages;
    expect(history.find((m: { id: string }) => m.id === message.id)?.photoSuggestion).toBe(true);

    const res = expectOk(await bob.api.post("/api/avatars/from-suggestion", { messageId: message.id, poster: POSTER }), avatarsChangeBody);
    expect(res.avatars).toHaveLength(1);
    const [entry] = res.avatars;
    expect(entry).toMatchObject({ kind: "image", poster: POSTER });
    // Своя копия, а не файл из лички.
    expect(entry!.url).not.toBe(message.attachments[0].url);
    expect(res.user).toMatchObject({ id: bob.id, avatarImage: POSTER });
    // Аватарку видят и те, кого нет в личке.
    expect((await download(carol.api, entry!.url)).status).toBe(200);
  });

  test("повторное нажатие не дублирует аватарку — та же копия становится главной", async () => {
    const [alice, bob] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(alice, bob);
    const message = await suggest(alice, dm.id);
    const first = expectOk(await bob.api.post("/api/avatars/from-suggestion", { messageId: message.id, poster: POSTER }), avatarsChangeBody);
    const again = expectOk(await bob.api.post("/api/avatars/from-suggestion", { messageId: message.id, poster: POSTER }), avatarsChangeBody);
    expect(again.avatars).toHaveLength(1);
    expect(again.avatars[0]!.url).toBe(first.avatars[0]!.url);
  });

  test("в секретном чате флаг не ставится", async () => {
    const [alice, bob] = await registerUsers(server().baseUrl, 2);
    const secret = (await alice.api.post("/api/chats/secret", { userId: bob.id })).body.chat;
    const message = await suggest(alice, secret.id);
    expect(message.photoSuggestion).toBeUndefined();
    expectError(await bob.api.post("/api/avatars/from-suggestion", { messageId: message.id, poster: POSTER }), 400, "Это не предложенное фото профиля");
  });

  test("отправитель сам поставить не может", async () => {
    const [alice, bob] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(alice, bob);
    const message = await suggest(alice, dm.id);
    expectError(await alice.api.post("/api/avatars/from-suggestion", { messageId: message.id, poster: POSTER }), 403, "Предложенное вами фото может установить только собеседник");
    expect((await alice.api.get("/api/avatars")).body.avatars).toEqual([]);
  });

  test("обычное фото и чужое сообщение — отказ", async () => {
    const [alice, bob, carol] = await registerUsers(server().baseUrl, 3);
    const dm = await createDm(alice, bob);
    const url = await photo(alice);
    const plain = await sendText(alice, dm.id, "", { attachments: [{ kind: "image", url, name: "p.png" }] });
    expect(plain.photoSuggestion).toBeUndefined();
    expectError(await bob.api.post("/api/avatars/from-suggestion", { messageId: plain.id, poster: POSTER }), 400, "Это не предложенное фото профиля");

    // Флаг на тексте без фото не ставится.
    const text = await sendText(alice, dm.id, "привет", { photoSuggestion: true });
    expect(text.photoSuggestion).toBeUndefined();

    const suggested = await suggest(alice, dm.id);
    expectError(await carol.api.post("/api/avatars/from-suggestion", { messageId: suggested.id, poster: POSTER }), 404, "Сообщение не найдено");
    expectError(await bob.api.post("/api/avatars/from-suggestion", { messageId: "m_nope", poster: POSTER }), 404, "Сообщение не найдено");
  });

  test("в группе флаг не ставится и фото не устанавливается", async () => {
    const [alice, bob] = await registerUsers(server().baseUrl, 2);
    const group = await createGroup(alice, [bob]);
    const message = await suggest(alice, group.id);
    expect(message.photoSuggestion).toBeUndefined();
    expectError(await bob.api.post("/api/avatars/from-suggestion", { messageId: message.id, poster: POSTER }), 400, "Это не предложенное фото профиля");
  });

  test("без превью — 400", async () => {
    const [alice, bob] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(alice, bob);
    const message = await suggest(alice, dm.id);
    expectError(await bob.api.post("/api/avatars/from-suggestion", { messageId: message.id }), 400, "Нет превью для аватарки");
  });
});
