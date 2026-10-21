// Настройки чата: PATCH /:id, палитра, флаги групп/каналов, права участников,
// реакции, обсуждение, звук, медленный режим, платные комментарии, приветствие,
// запрет пересылки, обои, бусты и публичность.
import { describe, expect, test } from "vitest";
import { chat, chatSummary } from "../../schemas/chat";
import {
  chatBody,
  chatCard,
  chatList,
  commentPriceBody,
  discussionBody,
  featuresBody,
  muteBody,
  permissionsBody,
  protectBody,
  setPermissionsBody,
  slowModeBody,
  wallpaperPersonalBody,
  welcomeBody,
} from "../../schemas/chats";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText, uniq } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";
import { z } from "zod";
import { anonymous, NO_RIGHTS, NOT_FOUND, registerPremiumUser, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

async function lastMessageOf(user: { api: any }, chatId: string) {
  return expectOk(await user.api.get(`/api/chats/${chatId}`), chatCard).chat.lastMessage;
}

describe("без сессии", () => {
  test("маршруты настроек отвечают 401", async () => {
    const api = anonymous(server().baseUrl);
    const id = "c_whatever00";
    const calls = [
      api.get(`/api/chats/${id}/features`),
      api.post(`/api/chats/${id}/settings`, {}),
      api.get(`/api/chats/${id}/permissions`),
      api.post(`/api/chats/${id}/permissions`, {}),
      api.post(`/api/chats/${id}/reactions`, {}),
      api.post(`/api/chats/${id}/discussion`, {}),
      api.post(`/api/chats/${id}/mute`, {}),
      api.post(`/api/chats/${id}/slow-mode`, {}),
      api.post(`/api/chats/${id}/comment-price`, {}),
      api.post(`/api/chats/${id}/welcome`, {}),
      api.post(`/api/chats/${id}/protect`, {}),
      api.post(`/api/chats/${id}/wallpaper`, {}),
      api.post(`/api/chats/${id}/vote`, {}),
      api.post(`/api/chats/${id}/public`, {}),
    ];
    for (const res of await Promise.all(calls)) expectError(res, 401, "unauthorized");
  });

  test("постороннему все маршруты настроек отвечают 404", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, []);
    const api = outsider.api;
    const id = group.id;
    const calls = [
      api.patch(`/api/chats/${id}`, { pinned: true }),
      api.get(`/api/chats/${id}/features`),
      api.post(`/api/chats/${id}/settings`, { approveJoins: true }),
      api.get(`/api/chats/${id}/permissions`),
      api.post(`/api/chats/${id}/permissions`, { permissions: {} }),
      api.post(`/api/chats/${id}/reactions`, {}),
      api.post(`/api/chats/${id}/discussion`, {}),
      api.post(`/api/chats/${id}/mute`, { forever: true }),
      api.post(`/api/chats/${id}/slow-mode`, { seconds: 10 }),
      api.post(`/api/chats/${id}/comment-price`, {}),
      api.post(`/api/chats/${id}/welcome`, {}),
      api.post(`/api/chats/${id}/protect`, {}),
      api.post(`/api/chats/${id}/wallpaper`, {}),
      api.post(`/api/chats/${id}/vote`, {}),
      api.post(`/api/chats/${id}/public`, {}),
    ];
    for (const res of await Promise.all(calls)) expectError(res, 404, NOT_FOUND);
  });
});

describe("PATCH /:id", () => {
  test("личные флаги (pinned/archived/muted/unread) — в сводке пользователя, без событий", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const bWs = await ws(b.api);
    const aWs = await ws(a.api);

    const res = await a.api.patch(`/api/chats/${dm.id}`, { pinned: true, archived: true, muted: true, unread: true });
    const summary = expectOk(res, z.strictObject({ chat: chatSummary })).chat;
    expect(summary).toMatchObject({ pinned: true, archived: true, muted: true, mutedUntil: null, unread: true, pinOrder: 0 });

    // У собеседника ничего не поменялось.
    const forB = expectOk(await b.api.get("/api/chats"), chatList).chats[0];
    expect(forB).toMatchObject({ pinned: false, archived: false, muted: false, pinOrder: null });
    expect(forB).not.toHaveProperty("unread");
    await aWs.expectNone("chat:updated");
    await bWs.expectNone("chat:updated");

    const back = expectOk(await a.api.patch(`/api/chats/${dm.id}`, { pinned: false, archived: false, muted: false, unread: false }), z.strictObject({ chat: chatSummary })).chat;
    expect(back).toMatchObject({ pinned: false, archived: false, muted: false, pinOrder: null });
    expect(back).not.toHaveProperty("unread");

    // Пустой PATCH — просто текущая сводка.
    expectOk(await a.api.patch(`/api/chats/${dm.id}`, {}), z.strictObject({ chat: chatSummary }));
  });

  test("архивный чат сам разархивируется при новом входящем сообщении", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    await a.api.patch(`/api/chats/${dm.id}`, { archived: true });
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats[0].archived).toBe(true);
    await sendText(b, dm.id, "эй");
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats[0].archived).toBe(false);
  });

  test("в личке название меняет любой участник, событие chat:updated обоим", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const aWs = await ws(a.api);
    const bWs = await ws(b.api);
    const updated = expectOk(await b.api.patch(`/api/chats/${dm.id}`, { title: "Наш чат" }), chatBody).chat;
    expect(updated.title).toBe("Наш чат");
    await aWs.waitFor("chat:updated", (e) => e.chat?.id === dm.id && e.chat.title === "Наш чат");
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === dm.id);
  });

  test("группа: менять оформление могут только владельцы и админы; проверки значений", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b], { title: "Старое" });
    const [bWs, outWs] = await Promise.all([ws(b.api), ws(outsider.api)]);

    for (const patch of [{ title: "x" }, { description: "x" }, { avatarImage: null }, { avatarColor: "#2E56D9" }, { autoDeleteSeconds: 60 }]) {
      expectError(await b.api.patch(`/api/chats/${group.id}`, patch), 403, "Менять настройки чата могут владельцы и админы");
    }
    expectError(await a.api.patch(`/api/chats/${group.id}`, { title: "   " }), 400, "Название не может быть пустым");
    expectError(await a.api.patch(`/api/chats/${group.id}`, { avatarImage: "javascript:alert(1)" }), 400, "Некорректное изображение");
    // Чужая неприкреплённая загрузка (или выдуманная ссылка) открылась бы всем — нельзя.
    const theirs = await uploadedUrl(outsider);
    for (const avatarImage of [theirs, fakeUploadUrl()]) {
      expectError(await a.api.patch(`/api/chats/${group.id}`, { avatarImage }), 400, "Некорректное изображение");
      expectError(await a.api.post("/api/chats/groups", { title: "Чужое", avatarImage }), 400, "Некорректное изображение");
      expectError(await a.api.post("/api/chats/channels", { title: "Чужое", avatarImage }), 400, "Некорректное изображение");
    }
    expect((await download(a.api, theirs)).status).toBe(404);
    expectError(await a.api.patch(`/api/chats/${group.id}`, { autoDeleteSeconds: -5 }), 400, "Некорректный срок автоудаления");
    expectError(await a.api.patch(`/api/chats/${group.id}`, { autoDeleteSeconds: 1.5 }), 400, "Некорректный срок автоудаления");
    expectError(
      await a.api.patch(`/api/chats/${group.id}`, { avatarColor: "#c6403b" }),
      403,
      "Цвет «Красный» открывается на 1-м уровне — набирайте баллы голосами участников"
    );

    const updated = expectOk(
      await a.api.patch(`/api/chats/${group.id}`, {
        title: " Новое ",
        description: "Описание",
        avatarColor: "#1f9d63",
        autoDeleteSeconds: 86400,
        // Служебные поля через PATCH не меняются.
        ownerIds: [b.id],
        adminIds: [b.id],
        memberIds: [b.id],
        bannedIds: [a.id],
      }),
      chatBody
    ).chat;
    expect(updated).toMatchObject({ title: "Новое", description: "Описание", avatarColor: "#1f9d63", autoDeleteSeconds: 86400, ownerIds: [a.id], adminIds: [a.id], bannedIds: [] });
    expect([...updated.memberIds].sort()).toEqual([a.id, b.id].sort());

    const ev = await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    expectShape(chat, ev.chat, "chat:updated");
    await outWs.expectNone("chat:updated");

    // Служебные строки — по одной на каждое изменение, последняя — про автоудаление.
    expect(await lastMessageOf(a, group.id)).toMatchObject({ type: "system", text: "Алиса включил(а) автоудаление сообщений: 1 дн." });

    // Сброс описания и автоудаления.
    const cleared = expectOk(await a.api.patch(`/api/chats/${group.id}`, { description: "", autoDeleteSeconds: 0 }), chatBody).chat;
    expect(cleared).not.toHaveProperty("description");
    expect(cleared).not.toHaveProperty("autoDeleteSeconds");
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса выключил(а) автоудаление сообщений" });
  });

  test("канал: служебная строка о смене названия без имени автора", async () => {
    const a = await registerUser(server().baseUrl);
    const channel = await createChannel(a);
    expectOk(await a.api.patch(`/api/chats/${channel.id}`, { title: "Свежее" }), chatBody);
    expect(await lastMessageOf(a, channel.id)).toMatchObject({ type: "system", text: "Название канала изменено на «Свежее»" });
  });
});

describe("GET /:id/features", () => {
  test("палитра: в группе без баллов открыт только нулевой уровень, в личке — всё", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const dm = await createDm(a, b);

    const g = expectOk(await b.api.get(`/api/chats/${group.id}/features`), featuresBody);
    expect(g.points).toBe(0);
    expect(g.colors).toHaveLength(14);
    expect(g.colors.filter((c) => c.unlocked).map((c) => c.hex)).toEqual(["#2E56D9", "#1f9d63", "#8a8f98"]);
    expect(g.colors[0]).toEqual({ hex: "#2E56D9", name: "Синий", level: 0, unlocked: true });

    const d = expectOk(await a.api.get(`/api/chats/${dm.id}/features`), featuresBody);
    expect(d.colors.every((c) => c.unlocked)).toBe(true);
  });
});

describe("POST /:id/settings", () => {
  test("ограничения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const channel = await createChannel(a, [b]);
    expectError(await a.api.post(`/api/chats/${dm.id}/settings`, { approveJoins: true }), 400, "Только для групп и каналов");
    expectError(await b.api.post(`/api/chats/${group.id}/settings`, { approveJoins: true }), 403, NO_RIGHTS);
    expectError(await a.api.post(`/api/chats/${group.id}/settings`, {}), 400, "Нечего менять");
    // commentsOff — только у каналов, anonymousAdmins — только у групп.
    expectError(await a.api.post(`/api/chats/${group.id}/settings`, { commentsOff: true }), 400, "Нечего менять");
    expectError(await a.api.post(`/api/chats/${channel.id}/settings`, { anonymousAdmins: true }), 400, "Нечего менять");
  });

  test("флаги канала и группы, chat:updated участникам", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    const [bWs, outWs] = await Promise.all([ws(b.api), ws(outsider.api)]);

    const ch = expectOk(await a.api.post(`/api/chats/${channel.id}/settings`, { approveJoins: 1, signMessages: true, commentsOff: true }), chatBody).chat;
    expect(ch).toMatchObject({ approveJoins: true, signMessages: true, commentsOff: true });
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === channel.id && e.chat.commentsOff === true);

    const off = expectOk(await a.api.post(`/api/chats/${channel.id}/settings`, { approveJoins: false, commentsOff: false }), chatBody).chat;
    expect(off).not.toHaveProperty("approveJoins");
    expect(off.commentsOff).toBe(false);

    const gr = expectOk(await a.api.post(`/api/chats/${group.id}/settings`, { anonymousAdmins: true }), chatBody).chat;
    expect(gr.anonymousAdmins).toBe(true);
    await outWs.expectNone("chat:updated");
  });
});

describe("права участников", () => {
  test("GET: по умолчанию всё разрешено, плюс список полей", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const body = expectOk(await b.api.get(`/api/chats/${group.id}/permissions`), permissionsBody);
    expect(Object.values(body.permissions).every((v) => v === true)).toBe(true);
    expect(body.fields.map((f) => f.id)).toEqual(["sendMessages", "sendMedia", "sendStickers", "sendPolls", "addMembers", "pinMessages", "createTopics", "setOwnTag"]);
    expect(body.fields[0]).toEqual({ id: "sendMessages", label: "Отправлять сообщения" });
  });

  test("POST: ограничения, нормализация и действие запретов", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    const bWs = await ws(b.api);

    expectError(await a.api.post(`/api/chats/${channel.id}/permissions`, { permissions: {} }), 400, "Права участников есть только у групп");
    expectError(await b.api.post(`/api/chats/${group.id}/permissions`, { permissions: {} }), 403, NO_RIGHTS);

    const res = await a.api.post(`/api/chats/${group.id}/permissions`, { permissions: { sendMessages: false, addMembers: false, setOwnTag: false, junk: false } });
    const body = expectOk(res, setPermissionsBody);
    // Хранится полный набор: не указанное — true, лишнее отброшено.
    expect(body.permissions).toEqual({ sendMessages: false, sendMedia: true, sendStickers: true, sendPolls: true, addMembers: false, pinMessages: true, createTopics: true, setOwnTag: false });
    expect(body.chat.permissions).toEqual(body.permissions);
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    expect(await lastMessageOf(a, group.id)).toMatchObject({ type: "system", text: "Алиса изменил(а) права участников" });

    // Участнику — запрет, владельцу — нет.
    expectError(await b.api.post(`/api/chats/${group.id}/messages`, { text: "можно?" }), 403, "В этой группе писать могут только администраторы");
    await sendText(a, group.id, "мне можно");
    expectError(await b.api.post(`/api/chats/${group.id}/members`, { userId: c.id, role: "add" }), 403, NO_RIGHTS);
    expectError(await b.api.post(`/api/chats/${group.id}/title`, { userId: b.id, title: "я" }), 403, "Недостаточно прав, чтобы менять этот тег");

    // Не объект — сброс к умолчаниям; участник снова может добавлять.
    const reset = expectOk(await a.api.post(`/api/chats/${group.id}/permissions`, { permissions: null }), setPermissionsBody);
    expect(reset.chat.permissions).toBeNull();
    expect(Object.values(reset.permissions).every((v) => v)).toBe(true);
    expectOk(await b.api.post(`/api/chats/${group.id}/members`, { userId: c.id, role: "add" }), chatBody);
    expectOk(await b.api.post(`/api/chats/${group.id}/title`, { userId: b.id, title: "я" }), chatBody);
  });
});

describe("POST /:id/reactions", () => {
  test("список реакций канала", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    const bWs = await ws(b.api);
    expectError(await a.api.post(`/api/chats/${group.id}/reactions`, { reactions: [] }), 400, "Список реакций настраивается только у каналов");
    expectError(await b.api.post(`/api/chats/${channel.id}/reactions`, { reactions: [] }), 403, NO_RIGHTS);

    const set = expectOk(await a.api.post(`/api/chats/${channel.id}/reactions`, { reactions: ["👍", " 👍 ", "", "🔥"] }), chatBody).chat;
    expect(set.allowedReactions).toEqual(["👍", "🔥"]);
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === channel.id);

    const many = Array.from({ length: 25 }, (_, i) => `r${i}`);
    expect(expectOk(await a.api.post(`/api/chats/${channel.id}/reactions`, { reactions: many }), chatBody).chat.allowedReactions).toHaveLength(20);
    // Пустой список — «реакции выключены», не массив — «все реакции».
    expect(expectOk(await a.api.post(`/api/chats/${channel.id}/reactions`, { reactions: [] }), chatBody).chat.allowedReactions).toEqual([]);
    expect(expectOk(await a.api.post(`/api/chats/${channel.id}/reactions`, {}), chatBody).chat.allowedReactions).toBeNull();
  });
});

describe("POST /:id/discussion", () => {
  test("отвязать, привязать, создать", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const channel = await createChannel(a, [b], { title: "Первый" });
    const other = await createChannel(a, [], { title: "Второй" });
    const myGroup = await createGroup(a, [b]);
    const foreignGroup = await createGroup(b, [a]);
    const bWs = await ws(b.api);

    expectError(await a.api.post(`/api/chats/${myGroup.id}/discussion`, { action: "unlink" }), 400, "Обсуждение есть только у каналов");
    expectError(await b.api.post(`/api/chats/${channel.id}/discussion`, { action: "unlink" }), 403, NO_RIGHTS);
    expectError(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "nope" }), 400, "Неизвестное действие");

    const unlinked = expectOk(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "unlink" }), discussionBody);
    expect(unlinked.discussion).toBeNull();
    expect(unlinked.chat).not.toHaveProperty("linkedDiscussionChatId");
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === channel.id);

    expectError(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "link", groupId: "c_nonexistent00" }), 404, "Группа не найдена");
    expectError(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "link", groupId: other.id }), 404, "Группа не найдена");
    expectError(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "link", groupId: foreignGroup.id }), 403, "Вы не администратор этой группы");
    expectError(
      await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "link", groupId: other.linkedDiscussionChatId }),
      409,
      "Эта группа уже обсуждение канала «Второй»"
    );

    const linked = expectOk(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "link", groupId: myGroup.id }), discussionBody);
    expect(linked.chat.linkedDiscussionChatId).toBe(myGroup.id);
    expect(linked.discussion?.id).toBe(myGroup.id);

    const created = expectOk(await a.api.post(`/api/chats/${channel.id}/discussion`, { action: "create" }), discussionBody);
    expect(created.discussion).toMatchObject({ type: "group", title: "Первый · Обсуждение", memberIds: [a.id], ownerId: a.id });
    expect(created.chat.linkedDiscussionChatId).toBe(created.discussion!.id);
  });
});

describe("POST /:id/mute", () => {
  test("навсегда, на время, снять; в сводке то же", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    expectError(await a.api.post(`/api/chats/${dm.id}/mute`, {}), 400, "Укажите срок");
    expectError(await a.api.post(`/api/chats/${dm.id}/mute`, { hours: -1 }), 400, "Укажите срок");

    const forever = expectOk(await a.api.post(`/api/chats/${dm.id}/mute`, { forever: true }), muteBody).chat;
    expect(forever).toMatchObject({ id: dm.id, muted: true, mutedUntil: null });
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats[0]).toMatchObject({ muted: true, mutedUntil: null });
    expect(expectOk(await b.api.get("/api/chats"), chatList).chats[0]).toMatchObject({ muted: false });

    const before = Date.now();
    const timed = expectOk(await a.api.post(`/api/chats/${dm.id}/mute`, { hours: 2 }), muteBody).chat;
    // На время: muted = true, пока не истёк mutedUntil.
    expect(timed.muted).toBe(true);
    const until = Date.parse(timed.mutedUntil!);
    expect(until - before).toBeGreaterThan(2 * 3600_000 - 60_000);
    expect(until - before).toBeLessThan(2 * 3600_000 + 60_000);
    expect(expectOk(await a.api.get("/api/chats"), chatList).chats[0]).toMatchObject({ muted: true, mutedUntil: timed.mutedUntil });

    const off = expectOk(await a.api.post(`/api/chats/${dm.id}/mute`, { off: true }), muteBody).chat;
    expect(off).toMatchObject({ muted: false, mutedUntil: null });
  });
});

describe("POST /:id/slow-mode", () => {
  test("включение, действие на отправку, выключение", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    const bWs = await ws(b.api);

    expectError(await a.api.post(`/api/chats/${channel.id}/slow-mode`, { seconds: 30 }), 400, "Медленный режим есть только у групп");
    expectError(await b.api.post(`/api/chats/${group.id}/slow-mode`, { seconds: 30 }), 403, NO_RIGHTS);

    const on = expectOk(await a.api.post(`/api/chats/${group.id}/slow-mode`, { seconds: 30.9 }), slowModeBody);
    expect(on).toMatchObject({ slowModeSeconds: 30, chat: { slowModeSeconds: 30 } });
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id && e.chat.slowModeSeconds === 30);
    expect(await lastMessageOf(a, group.id)).toMatchObject({ type: "system", text: "Алиса включил(а) медленный режим: 30 с" });

    await sendText(b, group.id, "раз");
    const blocked = await b.api.post(`/api/chats/${group.id}/messages`, { text: "два" });
    expectError(blocked, 429, /^Медленный режим: следующее сообщение можно отправить через \d+ с$/);
    expect(blocked.body.retryAfter).toBeGreaterThan(25);
    expect(blocked.body.retryAfter).toBeLessThanOrEqual(30);
    // Владельца медленный режим не касается.
    await sendText(a, group.id, "раз");
    await sendText(a, group.id, "два");

    expect(expectOk(await a.api.post(`/api/chats/${group.id}/slow-mode`, { seconds: 99999 }), slowModeBody).slowModeSeconds).toBe(3600);
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса включил(а) медленный режим: 1 ч" });

    const off = expectOk(await a.api.post(`/api/chats/${group.id}/slow-mode`, { seconds: 0 }), slowModeBody);
    expect(off.slowModeSeconds).toBe(0);
    expect(off.chat).not.toHaveProperty("slowModeSeconds");
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса выключил(а) медленный режим" });
    await sendText(b, group.id, "снова можно");
  });
});

describe("POST /:id/comment-price", () => {
  test("цена комментариев канала", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    const bWs = await ws(b.api);
    expectError(await a.api.post(`/api/chats/${group.id}/comment-price`, { stars: 5 }), 400, "Платные комментарии есть только у каналов");
    expectError(await b.api.post(`/api/chats/${channel.id}/comment-price`, { stars: 5 }), 403, NO_RIGHTS);

    const set = expectOk(await a.api.post(`/api/chats/${channel.id}/comment-price`, { stars: 7 }), commentPriceBody);
    expect(set).toMatchObject({ commentPriceStars: 7, chat: { commentPriceStars: 7 } });
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === channel.id);
    // Отдельное «пустое» обновление для группы обсуждения — только id.
    const disc = await bWs.waitFor("chat:updated", (e) => e.chat?.id === channel.linkedDiscussionChatId);
    expect(disc.chat).toEqual({ id: channel.linkedDiscussionChatId });

    expect(expectOk(await a.api.post(`/api/chats/${channel.id}/comment-price`, { stars: 1e9 }), commentPriceBody).commentPriceStars).toBe(90000);
    expect(expectOk(await a.api.post(`/api/chats/${channel.id}/comment-price`, { stars: -3 }), commentPriceBody).commentPriceStars).toBe(0);
  });
});

describe("POST /:id/welcome", () => {
  test("приветствие новым участникам группы", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl, { name: "Вера" });
    const channel = await createChannel(a, [b]);
    const group = await createGroup(a, [b]);
    expectError(await a.api.post(`/api/chats/${channel.id}/welcome`, { text: "x" }), 400, "Приветствие есть только у групп");
    expectError(await b.api.post(`/api/chats/${group.id}/welcome`, { text: "x" }), 403, NO_RIGHTS);

    const set = expectOk(await a.api.post(`/api/chats/${group.id}/welcome`, { text: "  Привет, {name}!  " }), welcomeBody);
    expect(set).toMatchObject({ welcomeText: "Привет, {name}!", chat: { welcomeText: "Привет, {name}!" } });
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса изменил(а) приветствие для новых участников" });

    expectOk(await a.api.post(`/api/chats/${group.id}/members`, { userId: c.id, role: "add" }), chatBody);
    expect(await lastMessageOf(c, group.id)).toMatchObject({ type: "system", text: "👋 Привет, Вера!" });

    const off = expectOk(await a.api.post(`/api/chats/${group.id}/welcome`, { text: "" }), welcomeBody);
    expect(off.welcomeText).toBe("");
    expect(off.chat).not.toHaveProperty("welcomeText");
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса выключил(а) приветствие" });
  });
});

describe("POST /:id/protect", () => {
  test("без Premium включить нельзя, только для личек", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    expectError(await a.api.post(`/api/chats/${group.id}/protect`, { enabled: true }), 400, "Только для личных чатов");
    const res = await a.api.post(`/api/chats/${dm.id}/protect`, { enabled: true });
    expectError(res, 402, "Запрет пересылки доступен с Premium");
    expect(res.body).toEqual({ error: "Запрет пересылки доступен с Premium", premiumHelps: true });
    // Выключение Premium не требует.
    expect(expectOk(await a.api.post(`/api/chats/${dm.id}/protect`, { enabled: false }), protectBody).protectedBy).toEqual([]);
  });

  test("с Premium: включает один, действует на обоих, снять может только включивший", async () => {
    const { baseUrl } = server();
    const p = await registerPremiumUser(baseUrl, { name: "Прем" });
    const b = await registerUser(baseUrl);
    const dm = await createDm(p, b);
    const msg = await sendText(p, dm.id, "секрет");
    const bWs = await ws(b.api);

    const on = expectOk(await p.api.post(`/api/chats/${dm.id}/protect`, { enabled: true }), protectBody);
    expect(on.protectedBy).toEqual([p.id]);
    const ev = await bWs.waitFor("chat:updated", (e) => e.chat?.id === dm.id);
    expect(ev.chat).toEqual({ id: dm.id, protectedBy: [p.id] });
    expect(await lastMessageOf(b, dm.id)).toMatchObject({ type: "system", text: "Прем запретил(а) пересылку и сохранение в этом чате" });

    // Пересылка из защищённого чата запрещена обоим.
    const target = await createDm(b, b);
    expectError(await b.api.post(`/api/chats/${target.id}/messages`, { text: "x", forwardedFrom: { messageId: msg.id } }), 403, "В этом чате запрещена пересылка");

    // Собеседник снять чужой запрет не может.
    expect(expectOk(await b.api.post(`/api/chats/${dm.id}/protect`, { enabled: false }), protectBody).protectedBy).toEqual([p.id]);
    expect(expectOk(await p.api.post(`/api/chats/${dm.id}/protect`, { enabled: false }), protectBody).protectedBy).toEqual([]);
    expect(await lastMessageOf(b, dm.id)).toMatchObject({ text: "Прем снова разрешил(а) пересылку" });
  });
});

describe("POST /:id/wallpaper", () => {
  test("личные обои — в настройках пользователя", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const wp = { kind: "color", value: "#123456" };
    const res = expectOk(await b.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: wp }), wallpaperPersonalBody);
    expect(res.settings.chatWallpapers).toEqual({ [group.id]: wp });
    // У чата и других участников ничего не поменялось.
    expect(expectOk(await a.api.get(`/api/chats/${group.id}`), chatCard).chat.wallpaper).toBeNull();
    const reset = expectOk(await b.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: null }), wallpaperPersonalBody);
    expect(reset.settings.chatWallpapers).toEqual({});
  });

  test("обои для всех: в группе — только админы, в личке — любой", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl, { name: "Алиса" });
    const b = await registerUser(baseUrl, { name: "Боб" });
    const group = await createGroup(a, [b]);
    const dm = await createDm(a, b);
    const bWs = await ws(b.api);
    const wp = { kind: "preset", id: "forest" };

    expectError(await b.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: wp, forEveryone: true }), 403, "Менять фон для всех могут только владельцы и админы");
    const set = expectOk(await a.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: wp, forEveryone: true, label: " Лес " }), chatBody).chat;
    expect(set.wallpaper).toEqual(wp);
    await bWs.waitFor("chat:updated", (e) => e.chat?.id === group.id);
    expect(await lastMessageOf(a, group.id)).toMatchObject({ type: "system", text: "Алиса поменял(а) фон чата на «Лес»" });

    expect(expectOk(await a.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: null, forEveryone: true }), chatBody).chat.wallpaper).toBeNull();
    expect(await lastMessageOf(a, group.id)).toMatchObject({ text: "Алиса сбросил(а) фон чата" });

    expectOk(await b.api.post(`/api/chats/${dm.id}/wallpaper`, { wallpaper: wp, forEveryone: true }), chatBody);
    expect(await lastMessageOf(a, dm.id)).toMatchObject({ text: "Боб поменял(а) фон чата" });
  });
});

describe("POST /:id/wallpaper — картинка", () => {
  test("только своя или уже доступная загрузка: чужая неприкреплённая → 400 (личные и для всех); повторно — можно", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const group = await createGroup(a, [b]);
    const theirs = await uploadedUrl(outsider);
    for (const forEveryone of [false, true]) {
      expectError(
        await a.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: { kind: "image", url: theirs }, forEveryone }),
        400,
        "Некорректная ссылка на файл"
      );
    }
    expect(expectOk(await a.api.get(`/api/chats/${group.id}`), chatCard).chat.wallpaper).toBeNull();
    expect((await download(a.api, theirs)).status).toBe(404);

    const wp = { kind: "image", url: await uploadedUrl(a) };
    expect(expectOk(await a.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: wp, forEveryone: true }), chatBody).chat.wallpaper).toEqual(wp);
    // Обои чата видны участникам — b может поставить ту же картинку и себе.
    expect(expectOk(await b.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: wp }), wallpaperPersonalBody).settings.chatWallpapers).toEqual({ [group.id]: wp });
    expectOk(await a.api.post(`/api/chats/${group.id}/wallpaper`, { wallpaper: wp, forEveryone: true }), chatBody);
  });
});

describe("POST /:id/vote (бусты)", () => {
  test("только группы и каналы, только Premium, раз в сутки", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const p = await registerPremiumUser(baseUrl);
    const group = await createGroup(a, [p]);
    const dm = await createDm(a, p);
    expectError(await p.api.post(`/api/chats/${dm.id}/vote`), 400, "Бусты доступны только для групп и каналов");
    expectError(await a.api.post(`/api/chats/${group.id}/vote`), 403, "Бустить могут только пользователи с Shalter Premium");

    const voted = expectOk(await p.api.post(`/api/chats/${group.id}/vote`), chatBody).chat;
    expect(voted.points).toBe(1);
    expect(Object.keys(voted.votes)).toEqual([p.id]);
    expect(expectOk(await a.api.get(`/api/chats/${group.id}/features`), featuresBody).points).toBe(1);

    const again = await p.api.post(`/api/chats/${group.id}/vote`);
    expectError(again, 429, "Вы уже бустили этот чат сегодня — следующий буст через сутки");
    expect(Date.parse(again.body.nextAt) - Date.parse(voted.votes[p.id] as string)).toBe(24 * 3600_000);
  });
});

describe("POST /:id/public", () => {
  test("сделать публичным и обратно", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const group = await createGroup(a, [b]);
    const handle = uniq("pub");
    expectError(await a.api.post(`/api/chats/${dm.id}/public`, { isPublic: true, username: handle }), 400, "Публичными могут быть только группы и каналы");
    expectError(await b.api.post(`/api/chats/${group.id}/public`, { isPublic: true, username: handle }), 403, NO_RIGHTS);
    expectError(await a.api.post(`/api/chats/${group.id}/public`, { isPublic: true, username: "x" }), 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _");

    const pub = expectOk(await a.api.post(`/api/chats/${group.id}/public`, { isPublic: true, username: `@${handle}` }), chatBody).chat;
    expect(pub).toMatchObject({ isPublic: true, username: handle });
    // Свой же юзернейм повторно — не конфликт.
    expectOk(await a.api.post(`/api/chats/${group.id}/public`, { isPublic: true, username: handle }), chatBody);
    expectOk(await b.api.get(`/api/chats/by-username/${handle}`), z.looseObject({ chat: z.looseObject({ id: z.literal(group.id) }) }));

    const priv = expectOk(await a.api.post(`/api/chats/${group.id}/public`, { isPublic: false }), chatBody).chat;
    expect(priv).not.toHaveProperty("isPublic");
    // Как у созданного частным: юзернейм снимается и освобождается.
    expect(priv).not.toHaveProperty("username");
    expectError(await b.api.get(`/api/chats/by-username/${handle}`), 404, NOT_FOUND);
    const other = await createGroup(b, []);
    expect(expectOk(await b.api.post(`/api/chats/${other.id}/public`, { isPublic: true, username: handle }), chatBody).chat.username).toBe(handle);
    expectError(await a.api.post(`/api/chats/${group.id}/public`, { isPublic: true, username: handle }), 409, "Этот юзернейм уже занят каналом");
  });
});
