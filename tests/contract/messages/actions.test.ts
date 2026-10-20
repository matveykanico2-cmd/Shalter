// Действия над сообщением: правка, удаление (у себя / у всех), закреп, реакции.
import { describe, expect, test } from "vitest";
import { deleteResult, historyPage, messageEnvelope, wsMessageDeleted, wsMessageNew, wsMessageUpdated } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { aboutMessage, msgs, useSockets } from "./helpers";

const server = useServer();
const ws = useSockets();

describe("PATCH /:messageId — правка", () => {
  test("автор правит: editedAt, message:updated всем участникам (и автору), не посторонним", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, "опечтка");
    const [aWs, bWs, outWs] = await Promise.all([ws(a), ws(b), ws(outsider)]);

    const edited = expectOk(await a.api.patch(msgs(dm.id, `/${sent.id}`), { text: "опечатка" }), messageEnvelope).message;
    expect(edited).toMatchObject({ id: sent.id, text: "опечатка", createdAt: sent.createdAt, editedAt: expect.any(String) });
    expect(edited.editedAt! >= sent.createdAt).toBe(true);

    for (const sock of [aWs, bWs]) {
      const ev = await sock.waitFor("message:updated", aboutMessage(sent.id));
      expectShape(wsMessageUpdated, ev);
      expect(ev).toMatchObject({ chatId: dm.id, message: { text: "опечатка" } });
    }
    await outWs.expectNone("message:updated", undefined, 50);

    const history = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(history.messages[0]).toMatchObject({ text: "опечатка", editedAt: edited.editedAt });
  });

  test("ошибки правки", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const other = await createGroup(a, [b]);
    const sent = await sendText(a, dm.id, "текст");
    const path = msgs(dm.id, `/${sent.id}`);

    expectError(await b.api.patch(path, { text: "чужое" }), 403, "forbidden");
    expectError(await a.api.patch(path, {}), 400, "Некорректный текст");
    expectError(await a.api.patch(path, { text: 42 }), 400, "Некорректный текст");
    expectError(await a.api.patch(path, { text: "я".repeat(4097) }), 400, "Сообщение длиннее 4096 символов");
    expectError(await a.api.patch(path, { text: "   " }), 400, "Сообщение не может быть пустым");
    expectError(await outsider.api.patch(path, { text: "x" }), 404, "not found");
    // Сообщение есть, но в другом чате.
    expectError(await a.api.patch(msgs(other.id, `/${sent.id}`), { text: "x" }), 404, "not found");
    expectError(await a.api.patch(msgs(dm.id, "/m_doesnotexist0"), { text: "x" }), 404, "not found");
    expectError(await new Api(baseUrl).patch(path, { text: "x" }), 401, "unauthorized");

    // Пересланное править нельзя.
    const fwd = await sendText(a, dm.id, "x", { forwardedFrom: { messageId: sent.id } });
    expectError(await a.api.patch(msgs(dm.id, `/${fwd.id}`), { text: "подмена" }), 400, "Это сообщение нельзя изменить");

    // С вложением текст можно стереть.
    const withDice = await sendText(a, dm.id, "подпись", { attachments: [{ kind: "dice", meta: { emoji: "🎲" } }] });
    const cleared = expectOk(await a.api.patch(msgs(dm.id, `/${withDice.id}`), { text: "" }), messageEnvelope).message;
    expect(cleared.text).toBe("");
  });
});

describe("DELETE /:messageId", () => {
  test("у себя: пропадает только у удалившего, без WS", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const sent = await sendText(b, dm.id, "удалю у себя");
    const bWs = await ws(b);

    const res = expectOk(await a.api.delete(msgs(dm.id, `/${sent.id}`), { forEveryone: false }), deleteResult);
    expect(res).toEqual({ ok: true, id: sent.id, forEveryone: false });
    // Без тела — тоже «у себя».
    expect(expectOk(await a.api.delete(msgs(dm.id, `/${sent.id}`)), deleteResult).forEveryone).toBe(false);

    expect(expectOk(await a.api.get(msgs(dm.id)), historyPage).messages).toEqual([]);
    const forB = expectOk(await b.api.get(msgs(dm.id)), historyPage).messages;
    expect(forB.map((m) => m.id)).toEqual([sent.id]);
    // ПОВЕДЕНИЕ-ВОПРОС: собеседник видит в deletedForIds, кто скрыл сообщение у себя.
    expect(forB[0].deletedForIds).toEqual([a.id]);
    await bWs.expectNone("message:deleted");
  });

  test("у всех — автор: message:deleted остальным участникам, не автору и не посторонним", async () => {
    const { baseUrl } = server();
    const [a, b, c, outsider] = await registerUsers(baseUrl, 4);
    const group = await createGroup(a, [b, c]);
    const sent = await sendText(b, group.id, "удалю у всех");
    const [aWs, bWs, cWs, outWs] = await Promise.all([ws(a), ws(b), ws(c), ws(outsider)]);

    const res = expectOk(await b.api.delete(msgs(group.id, `/${sent.id}`), { forEveryone: true }), deleteResult);
    expect(res).toEqual({ ok: true, id: sent.id, forEveryone: true });
    for (const sock of [aWs, cWs]) {
      const ev = await sock.waitFor("message:deleted", (e) => e.id === sent.id);
      expect(expectShape(wsMessageDeleted, ev)).toEqual({ type: "message:deleted", chatId: group.id, id: sent.id });
    }
    await bWs.expectNone("message:deleted");
    await outWs.expectNone("message:deleted", undefined, 50);

    for (const u of [a, b, c]) {
      expect(expectOk(await u.api.get(msgs(group.id)), historyPage).messages.map((m) => m.id)).not.toContain(sent.id);
    }
    // Повторное удаление — сообщения уже нет.
    expectError(await b.api.delete(msgs(group.id, `/${sent.id}`), { forEveryone: true }), 404, "not found");
  });

  test("у всех — права: в группе чужое удаляют только админы; в личке — любой из двоих", async () => {
    const { baseUrl } = server();
    const [owner, member, other, outsider] = await registerUsers(baseUrl, 4);
    const group = await createGroup(owner, [member, other]);
    const byOther = await sendText(other, group.id, "чужое");

    expectError(
      await member.api.delete(msgs(group.id, `/${byOther.id}`), { forEveryone: true }),
      403,
      "Удалить чужое сообщение у всех могут владельцы, админы и модераторы",
    );
    // Посторонний (не модератор сервера) — 404.
    expectError(await outsider.api.delete(msgs(group.id, `/${byOther.id}`), { forEveryone: true }), 404, "not found");
    expectError(await outsider.api.delete(msgs(group.id, `/${byOther.id}`)), 404, "not found");
    expectError(await new Api(baseUrl).delete(msgs(group.id, `/${byOther.id}`)), 401, "unauthorized");
    expectOk(await owner.api.delete(msgs(group.id, `/${byOther.id}`), { forEveryone: true }), deleteResult);

    const dm = await createDm(owner, member);
    const mine = await sendText(owner, dm.id, "в личке");
    expectOk(await member.api.delete(msgs(dm.id, `/${mine.id}`), { forEveryone: true }), deleteResult);
    expect(expectOk(await owner.api.get(msgs(dm.id)), historyPage).messages).toEqual([]);
  });
});

describe("POST /:messageId/pin", () => {
  test("в личке закрепляет любой; message:updated собеседнику", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, "важное");
    const [aWs, bWs] = await Promise.all([ws(a), ws(b)]);

    const pinned = expectOk(await b.api.post(msgs(dm.id, `/${sent.id}/pin`), { pinned: true }), messageEnvelope).message;
    expect(pinned.pinned).toBe(true);
    const ev = await aWs.waitFor("message:updated", aboutMessage(sent.id));
    expectShape(wsMessageUpdated, ev);
    expect(ev.message.pinned).toBe(true);
    await bWs.expectNone("message:updated", aboutMessage(sent.id));

    expect(expectOk(await a.api.post(msgs(dm.id, `/${sent.id}/pin`), { pinned: false }), messageEnvelope).message.pinned).toBe(false);
    // Без pinned в теле — открепляет.
    await a.api.post(msgs(dm.id, `/${sent.id}/pin`), { pinned: true });
    expect(expectOk(await a.api.post(msgs(dm.id, `/${sent.id}/pin`), {}), messageEnvelope).message.pinned).toBe(false);

    expectError(await outsider.api.post(msgs(dm.id, `/${sent.id}/pin`), { pinned: true }), 404, "not found");
    expectError(await new Api(baseUrl).post(msgs(dm.id, `/${sent.id}/pin`), { pinned: true }), 401, "unauthorized");
  });

  test("в группе — служебная строка «… закрепил(а) «…»»; в канале подписчик не может", async () => {
    const { baseUrl } = server();
    const [owner, member] = await registerUsers(baseUrl, 2);
    const group = await createGroup(owner, [member]);
    const sent = await sendText(owner, group.id, "x".repeat(45));
    const ownerWs = await ws(owner);

    expectOk(await member.api.post(msgs(group.id, `/${sent.id}/pin`), { pinned: true }), messageEnvelope);
    const line = await ownerWs.waitFor("message:new", (e) => e.message?.type === "system");
    expectShape(wsMessageNew, line);
    expect(line.message.text).toBe(`Тест 2 закрепил(а) «${"x".repeat(40)}…»`);
    // Повторное закрепление уже закреплённого — без новой строки.
    ownerWs.clear();
    expectOk(await member.api.post(msgs(group.id, `/${sent.id}/pin`), { pinned: true }), messageEnvelope);
    await ownerWs.expectNone("message:new");

    const channel = await createChannel(owner, [member]);
    const post = await sendText(owner, channel.id, "пост");
    expectError(
      await member.api.post(msgs(channel.id, `/${post.id}/pin`), { pinned: true }),
      403,
      "Закреплять сообщения могут владельцы, админы и модераторы",
    );
    expect(expectOk(await owner.api.post(msgs(channel.id, `/${post.id}/pin`), { pinned: true }), messageEnvelope).message.pinned).toBe(true);
  });
});

describe("POST /:messageId/react", () => {
  test("реакция переключается; без Premium — одна на человека; WS остальным", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    const sent = await sendText(a, group.id, "реагируйте");
    const [aWs, bWs, outWs] = await Promise.all([ws(a), ws(b), ws(outsider)]);
    const react = (u: typeof a, emoji: unknown) => u.api.post(msgs(group.id, `/${sent.id}/react`), { emoji });

    let m = expectOk(await react(b, "👍"), messageEnvelope).message;
    expect(m.reactions).toEqual([{ emoji: "👍", userIds: [b.id] }]);
    const ev = await aWs.waitFor("message:updated", aboutMessage(sent.id));
    expectShape(wsMessageUpdated, ev);
    expect(ev.message.reactions).toEqual([{ emoji: "👍", userIds: [b.id] }]);
    await bWs.expectNone("message:updated", aboutMessage(sent.id));
    await outWs.expectNone("message:updated", undefined, 50);

    m = expectOk(await react(a, "👍"), messageEnvelope).message;
    expect(m.reactions).toEqual([{ emoji: "👍", userIds: [b.id, a.id] }]);

    // Вторая реакция без Premium заменяет первую.
    m = expectOk(await react(b, "❤️"), messageEnvelope).message;
    expect(m.reactions).toEqual([
      { emoji: "👍", userIds: [a.id] },
      { emoji: "❤️", userIds: [b.id] },
    ]);

    // Повтор той же — снимает; пустая группа реакций исчезает.
    m = expectOk(await react(b, "❤️"), messageEnvelope).message;
    expect(m.reactions).toEqual([{ emoji: "👍", userIds: [a.id] }]);

    // Пустая/не строка — ничего не меняет, но 200.
    for (const bad of ["", "   ", 5, undefined]) {
      expect(expectOk(await react(b, bad), messageEnvelope).message.reactions).toEqual([{ emoji: "👍", userIds: [a.id] }]);
    }
    // Пробелы по краям обрезаются.
    m = expectOk(await react(b, "  🎉 "), messageEnvelope).message;
    expect(m.reactions.map((r: any) => r.emoji)).toEqual(["👍", "🎉"]);

    expectError(await react(outsider, "👍"), 404, "not found");
    expectError(await new Api(baseUrl).post(msgs(group.id, `/${sent.id}/react`), { emoji: "👍" }), 401, "unauthorized");
  });
});
