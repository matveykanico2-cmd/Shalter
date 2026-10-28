// Обходы по таймеру: автоудаление сообщений, напоминания, удаление аккаунтов по сроку,
// дни рождения, праздники, уборка файлов. В режиме тестов по таймеру они не идут —
// тест прогоняет один проход служебным вызовом POST /api/test/sweeps/:name, а сервер
// выполняет его там же, где на боевом сервере, — в фоновом процессе. now в теле —
// момент, от которого обход считает сроки, так тест «переводит часы» вперёд.
// DonationAlerts и DonatePay ходят во внешний мир по HTTPS, их здесь нет.
import { afterAll, describe, expect, test } from "vitest";
import { scheduleDeletionBody, totpSetupBody, twoFactorChallenge, twoFactorEnabledBody } from "../../schemas/auth";
import { wsMessageDeleted } from "../../schemas/messages";
import { uploadResult } from "../../schemas/uploads";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, createGroup, registerUser, registerUsers, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { SYSTEM_BOT_ID, systemMessages } from "../auth/helpers";
import { STEP_SECONDS, totp } from "../auth/totp";
import { download, uniquePng, upload } from "../uploads/helpers";

const HELPER_BOT_ID = "bot_helper";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const server = useServer();
const inline = useServer({ env: { BACKGROUND_WORKER: "0" } });
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

async function sweep(name: string, now?: Date, baseUrl = server().baseUrl) {
  const res = await new Api(baseUrl).post(`/api/test/sweeps/${name}`, now ? { now: now.toISOString() } : {});
  expect(res.status, res.text).toBe(200);
  expect(res.body).toEqual({ ok: true });
}

async function messages(user: TestUser, chatId: string): Promise<any[]> {
  const res = await user.api.get(`/api/chats/${chatId}/messages`, { query: { limit: 200 } });
  expect(res.status, res.text).toBe(200);
  return res.body.messages;
}

async function waitMessage(user: TestUser, chatId: string, pred: (m: any) => boolean, timeoutMs = 3000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = (await messages(user, chatId)).find(pred);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error("не дождались сообщения");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const fromSystem = (prefix: string) => (m: any) => m.senderId === SYSTEM_BOT_ID && String(m.text ?? "").startsWith(prefix);

describe("служебный вызов", () => {
  test("неизвестный обход — 404, неверное время — 400", async () => {
    const api = new Api(server().baseUrl);
    expectError(await api.post("/api/test/sweeps/nope", {}), 404, "Нет такого обхода");
    expectError(await api.post("/api/test/sweeps/__proto__", {}), 404, "Нет такого обхода");
    expectError(await api.post("/api/test/sweeps/reminders", { now: "вчера" }), 400, "Некорректное время");
  });
});

describe("автоудаление", () => {
  async function check(baseUrl: string, ws: boolean) {
    const [a, b] = await registerUsers(baseUrl, 2);
    const group = await createGroup(a, [b]);
    expect((await a.api.patch(`/api/chats/${group.id}`, { autoDeleteSeconds: 3600 })).status).toBe(200);
    const sent = await sendText(a, group.id, "исчезнет через час");
    const bWs = ws ? await connectWs(b.api) : null;
    if (bWs) sockets.push(bWs);

    // Срок не вышел — сообщение на месте.
    await sweep("auto-delete", new Date(Date.now() + 30 * 60_000), baseUrl);
    expect((await messages(b, group.id)).map((m) => m.id)).toContain(sent.id);

    await sweep("auto-delete", new Date(Date.now() + 2 * HOUR), baseUrl);
    if (bWs) expectShape(wsMessageDeleted, await bWs.waitFor("message:deleted", (e) => e.id === sent.id));
    expect((await messages(b, group.id)).map((m) => m.id)).not.toContain(sent.id);
  }

  test("сообщения старше срока чата удаляются, участники получают message:deleted", async () => {
    await check(server().baseUrl, true);
  });

  test("BACKGROUND_WORKER=0: обход идёт в самом сервере", async () => {
    await check(inline().baseUrl, false);
  });

  test("в чате без автоудаления ничего не трогается", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(a, b);
    const sent = await sendText(a, dm.id, "навсегда");
    await sweep("auto-delete", new Date(Date.now() + 400 * DAY));
    expect((await messages(a, dm.id)).map((m) => m.id)).toContain(sent.id);
  });
});

describe("напоминания", () => {
  test("/remind приходит от помощника в срок и один раз", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "/remind 10m купить хлеб");
    await waitMessage(a, dm.id, (m) => m.senderId === HELPER_BOT_ID && m.text === "📝 Напомню через 10m: купить хлеб");

    const isReminder = (m: any) => m.senderId === HELPER_BOT_ID && m.text === "⏰ Напоминание: купить хлеб";
    await sweep("reminders", new Date(Date.now() + 5 * 60_000));
    expect((await messages(a, dm.id)).filter(isReminder)).toEqual([]);

    await sweep("reminders", new Date(Date.now() + 11 * 60_000));
    await waitMessage(b, dm.id, isReminder);
    await sweep("reminders", new Date(Date.now() + 20 * 60_000));
    expect((await messages(a, dm.id)).filter(isReminder)).toHaveLength(1);
  });

  test("напоминание из чата, где автора уже нет, не отправляется", async () => {
    const [a, b, c] = await registerUsers(server().baseUrl, 3);
    const group = await createGroup(a, [b, c]);
    await sendText(b, group.id, "/remind 1m позвонить");
    await waitMessage(a, group.id, (m) => m.senderId === HELPER_BOT_ID && m.text === "📝 Напомню через 1m: позвонить");
    expect((await b.api.post(`/api/chats/${group.id}/leave`, {})).status).toBe(200);

    await sweep("reminders", new Date(Date.now() + 2 * 60_000));
    expect((await messages(a, group.id)).filter((m) => m.text === "⏰ Напоминание: позвонить")).toEqual([]);
  });
});

describe("удаление аккаунта по сроку", () => {
  async function awayFromStepBoundary() {
    const left = STEP_SECONDS * 1000 - (Date.now() % (STEP_SECONDS * 1000));
    if (left < 2000) await new Promise((r) => setTimeout(r, left + 50));
  }

  test("аккаунт удаляется, когда наступил срок, и не раньше", async () => {
    const { baseUrl } = server();
    const user = await registerUser(baseUrl);
    const friend = await registerUser(baseUrl);
    await createDm(friend, user);
    const { secret } = expectOk(await user.api.post("/api/auth/2fa/setup", {}), totpSetupBody);
    await awayFromStepBoundary();
    expectOk(await user.api.post("/api/auth/2fa/enable", { code: totp(secret, Date.now(), -1) }), twoFactorEnabledBody);

    const api = new Api(baseUrl);
    const { ticket } = expectOk(await api.post("/api/auth/login-email", { email: user.email, password: user.password }), twoFactorChallenge);
    const { deleteAt } = expectOk(await api.post("/api/auth/schedule-deletion", { ticket }), scheduleDeletionBody);

    await sweep("account-deletion", new Date(Date.parse(deleteAt) - HOUR));
    expect((await friend.api.get(`/api/users/${user.id}`)).status).toBe(200);

    await sweep("account-deletion", new Date(Date.parse(deleteAt) + 1000));
    expectError(await friend.api.get(`/api/users/${user.id}`), 404, "not found");
    expect((await friend.api.get("/api/chats")).body.chats.filter((c: any) => c.memberIds.includes(user.id))).toEqual([]);
    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: user.email, password: user.password }), 401, "Неверный email или пароль");
    expectError(await user.api.get("/api/chats"), 401, "session_revoked");
  });
});

describe("дни рождения", () => {
  test("в день рождения владельцы контакта получают поздравление от Shalter, один раз в год", async () => {
    const [hero, friend, stranger] = await registerUsers(server().baseUrl, 3);
    expect((await hero.api.patch(`/api/users/${hero.id}`, { birthday: "1990-03-15" })).status).toBe(200);
    expect((await friend.api.post("/api/contacts", { userId: hero.id })).status).toBe(200);

    const text = `🎂 Сегодня день рождения у ${hero.name}! Поздравьте и, если хотите — подарите подарок.`;
    await sweep("birthdays", new Date("2027-03-14T12:00:00Z"));
    expect((await systemMessages(friend.api)).filter(fromSystem("🎂"))).toEqual([]);

    await sweep("birthdays", new Date("2027-03-15T12:00:00Z"));
    const [greeting] = (await systemMessages(friend.api)).filter(fromSystem("🎂"));
    expect(greeting.text).toBe(text);
    expect(greeting.attachments).toHaveLength(1);
    expect(greeting.attachments[0]).toMatchObject({ kind: "birthday", meta: { userId: hero.id, name: hero.name, avatarImage: null } });
    expect(greeting.attachments[0].meta.suggestedGifts.length).toBeGreaterThan(0);
    expect(greeting.attachments[0].meta.suggestedGifts.length).toBeLessThanOrEqual(8);
    expect((await systemMessages(stranger.api)).filter(fromSystem("🎂"))).toEqual([]);
    expect((await systemMessages(hero.api)).filter(fromSystem("🎂"))).toEqual([]);

    // Повтор в тот же год — без второго поздравления; на следующий год — снова.
    await sweep("birthdays", new Date("2027-03-15T18:00:00Z"));
    expect((await systemMessages(friend.api)).filter(fromSystem("🎂"))).toHaveLength(1);
    await sweep("birthdays", new Date("2028-03-15T12:00:00Z"));
    expect((await systemMessages(friend.api)).filter(fromSystem("🎂"))).toHaveLength(2);
  });
});

describe("праздники", () => {
  test("свой праздник приходит в его день, отключённый встроенный — нет", async () => {
    const [user] = await registerUsers(server().baseUrl, 1);
    const patch = { holidays: { disabled: ["shalter_day"], custom: [{ date: "04-15", title: "День экологических знаний" }] } };
    expect((await user.api.patch("/api/settings", patch)).status).toBe(200);

    await sweep("holidays", new Date("2027-09-25T12:00:00Z"));
    expect((await systemMessages(user.api)).filter(fromSystem("🎉"))).toEqual([]);

    await sweep("holidays", new Date("2027-04-15T12:00:00Z"));
    await sweep("holidays", new Date("2027-04-15T13:00:00Z"));
    const sent = (await systemMessages(user.api)).filter(fromSystem("🎉"));
    expect(sent.map((m) => m.text)).toEqual(["🎉 Сегодня День экологических знаний! Поздравляем."]);
  });

  test("встроенный праздник приходит всем, кто его не отключал", async () => {
    const [user] = await registerUsers(server().baseUrl, 1);
    await sweep("holidays", new Date("2027-09-25T12:00:00Z"));
    const sent = (await systemMessages(user.api)).filter(fromSystem("🎉"));
    expect(sent.map((m) => m.text)).toEqual(["🎉 Сегодня День основания Shalter! Поздравляем."]);
  });
});

describe("файлы хранятся всегда", () => {
  // Как в Telegram: старые медиа не удаляются — обхода «uploads» больше нет.
  test("обхода uploads нет; и ничейный файл, и прочитанное всеми вложение остаются", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const dm = await createDm(a, b);
    const orphan = expectOk(await upload(a.api, uniquePng(), { kind: "image", name: "o.png" }), uploadResult);
    const read = expectOk(await upload(a.api, uniquePng(), { kind: "image", name: "r.png" }), uploadResult);
    await sendText(a, dm.id, "", { attachments: [{ kind: "image", url: read.url }] });
    expect((await b.api.post(`/api/chats/${dm.id}/read`, {})).status).toBe(200);

    const res = await new Api(server().baseUrl).post("/api/test/sweeps/uploads", { now: new Date(Date.now() + 30 * DAY).toISOString() });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Нет такого обхода" });
    for (const name of ["auto-delete", "reminders", "account-deletion", "birthdays", "holidays"]) await sweep(name, new Date(Date.now() + 30 * DAY));
    expect((await download(a.api, orphan.url)).status).toBe(200);
    expect((await download(a.api, read.url)).status).toBe(200);
  });
});
