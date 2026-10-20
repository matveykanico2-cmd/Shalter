// Жалобы: POST /api/reports (пользователь, чат, сообщение) и разбор жалобы
// модератором — POST /api/reports/:id/resolve (delete / ban / dismiss).
// Уведомление о жалобе получают админы по номеру и все с разделом «moderation»
// — сообщением от системного бота с карточкой report.
import { describe, expect, test } from "vitest";
import { moderationBody } from "../../schemas/admin";
import { message } from "../../schemas/message";
import { reportBody, reportCard, resolveBody } from "../../schemas/reports";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import type { WsClient } from "../../support/ws";
import { ADMIN_ENV, admins, anonymous, NO_RIGHTS, RANK_ERROR, sectionAdmin, SYSTEM_BOT_ID, systemMessages, wsPool } from "../admin/helpers";

const server = useServer({ env: ADMIN_ENV });
const ws = wsPool();
const { primary, extra } = admins(() => server().baseUrl);

let modUser: TestUser | undefined;
async function mod(): Promise<TestUser> {
  modUser ??= await sectionAdmin(server().baseUrl, await primary(), ["moderation"], { name: "Модератор" });
  return modUser;
}

const report = (u: TestUser, body: unknown) => u.api.post("/api/reports", body);
const resolve = (u: TestUser, id: string, action: unknown) => u.api.post(`/api/reports/${id}/resolve`, { action });

const isReportFor = (reportId: string) => (e: any) => e.message?.senderId === SYSTEM_BOT_ID && e.message?.report?.reportId === reportId;

async function waitReport(socket: WsClient, reportId: string) {
  const ev = await socket.waitFor("message:new", isReportFor(reportId), 8000);
  const msg = expectShape(message, ev.message);
  return { ...msg, card: expectShape(reportCard, msg.report) };
}

describe("без сессии", () => {
  test("401", async () => {
    const api = anonymous(server().baseUrl);
    expectError(await api.post("/api/reports", { targetType: "user" }), 401, "unauthorized");
    expectError(await api.post("/api/reports/rp_whatever00/resolve", { action: "dismiss" }), 401, "unauthorized");
  });
});

describe("POST /api/reports", () => {
  test("жалоба на пользователя: уведомление всем модераторам и админам по номеру, но не жалобщику и не посторонним", async () => {
    const { baseUrl } = server();
    const [p, x, m] = [await primary(), await extra(), await mod()];
    const legal = await sectionAdmin(baseUrl, p, ["legal"]);
    const reporter = await registerUser(baseUrl, { name: "Жалобщик" });
    const target = await registerUser(baseUrl, { name: "Спамер" });
    const outsider = await registerUser(baseUrl);
    const [pWs, xWs, mWs, legalWs, reporterWs, targetWs, outsiderWs] = await Promise.all([p, x, m, legal, reporter, target, outsider].map((u) => ws(u.api)));

    const res = await report(reporter, { targetType: "user", targetId: target.id, reason: "spam", details: `  ${"д".repeat(2100)}  ` });
    const { report: r } = expectOk(res, reportBody);
    expect(r).toMatchObject({ reporterId: reporter.id, targetType: "user", targetId: target.id, subjectUserId: target.id, reason: "spam", status: "open" });
    expect(r.details).toBe("д".repeat(2000));

    for (const socket of [pWs, xWs, mWs]) {
      const msg = await waitReport(socket, r.id);
      expect(msg.type).toBe("report");
      expect(msg.text).toBe(`🚩 Новая жалоба (Спам) от Жалобщик\nПользователь: Спамер (@${target.username})\n«${"д".repeat(2000)}»`);
      expect(msg.card).toEqual({ reportId: r.id, reason: "spam", reporterName: "Жалобщик", targetType: "user", targetSummary: `Пользователь: Спамер (@${target.username})`, status: "open", canBan: true });
    }
    for (const socket of [legalWs, reporterWs, targetWs, outsiderWs]) await socket.expectNone("message:new", isReportFor(r.id), 0);
    await outsiderWs.expectNone("message:new");

    // Жалоба видна в модерации.
    expect(expectOk(await m.api.get("/api/admin/moderation"), moderationBody).openReports.some((o) => o.id === r.id)).toBe(true);
  });

  test("жалоба от модератора не приходит ему самому; details необязательны", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const p = await primary();
    const target = await registerUser(baseUrl);
    const [mWs, pWs] = await Promise.all([ws(m.api), ws(p.api)]);
    const { report: r } = expectOk(await report(m, { targetType: "user", targetId: target.id, reason: "other" }), reportBody);
    expect(r.details).toBe("");
    const msg = await waitReport(pWs, r.id);
    expect(msg.text).toBe(`🚩 Новая жалоба (Другое) от Модератор\nПользователь: ${target.name} (@${target.username})`);
    await mWs.expectNone("message:new", isReportFor(r.id));
  });

  test("жалоба на группу, канал, личку и сообщение: сводка и ответственный", async () => {
    const { baseUrl } = server();
    const p = await primary();
    const pWs = await ws(p.api);
    const owner = await registerUser(baseUrl, { name: "Владелец" });
    const reporter = await registerUser(baseUrl, { name: "Читатель" });
    const group = await createGroup(owner, [reporter], { title: "Сомнительная группа" });
    const channel = await createChannel(owner, [reporter], { title: "Сомнительный канал" });
    const dm = await createDm(reporter, owner);
    const msg = await sendText(owner, dm.id, "переведи деньги сюда");

    const cases: Array<[unknown, { subject: string | null; summary: string; canBan: boolean; reason: string }]> = [
      [{ targetType: "chat", targetId: group.id, reason: "illegal" }, { subject: owner.id, summary: "Группа: Сомнительная группа", canBan: true, reason: "Незаконный контент" }],
      [{ targetType: "chat", targetId: channel.id, reason: "extremism" }, { subject: owner.id, summary: "Канал: Сомнительный канал", canBan: true, reason: "Экстремизм" }],
      [{ targetType: "chat", targetId: dm.id, reason: "violence" }, { subject: null, summary: "Чат: (без названия)", canBan: false, reason: "Насилие или угрозы" }],
      [{ targetType: "message", targetId: msg.id, reason: "scam" }, { subject: owner.id, summary: "Сообщение: «переведи деньги сюда»", canBan: true, reason: "Мошенничество" }],
    ];
    for (const [body, want] of cases) {
      const { report: r } = expectOk(await report(reporter, body), reportBody);
      expect(r.subjectUserId).toBe(want.subject);
      const got = await waitReport(pWs, r.id);
      expect(got.text).toBe(`🚩 Новая жалоба (${want.reason}) от Читатель\n${want.summary}`);
      expect(got.card).toMatchObject({ targetSummary: want.summary, canBan: want.canBan });
    }
  });

  test("ошибки: тип, причина, цель, себя и своё сообщение, сообщение из чужого чата", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const c = await registerUser(baseUrl);
    const dm = await createDm(b, c);
    const foreign = await sendText(b, dm.id, "чужое");
    const own = await sendText(b, dm.id, "моё");

    expectError(await report(a, { targetType: "bot", targetId: b.id, reason: "spam" }), 400, "invalid target type");
    expectError(await report(a, {}), 400, "invalid target type");
    expectError(await report(a, { targetType: "user", targetId: b.id, reason: "boring" }), 400, "invalid reason");
    expectError(await report(a, { targetType: "user", targetId: "u_nonexistent00", reason: "spam" }), 404, "not found");
    expectError(await report(a, { targetType: "chat", targetId: "c_nonexistent00", reason: "spam" }), 404, "not found");
    expectError(await report(a, { targetType: "message", targetId: "m_nonexistent00", reason: "spam" }), 404, "not found");
    expectError(await report(a, { targetType: "message", targetId: foreign.id, reason: "spam" }), 404, "not found");
    expectError(await report(a, { targetType: "user", targetId: a.id, reason: "spam" }), 400, "Нельзя пожаловаться на себя");
    expectError(await report(b, { targetType: "message", targetId: own.id, reason: "spam" }), 400, "Нельзя пожаловаться на своё сообщение");
    // ПОВЕДЕНИЕ-ВОПРОС: на чат жаловаться можно и не будучи участником — достаточно знать id (существование
    // чужой лички/группы подтверждается ответом 200 вместо 404).
    expect(expectOk(await report(a, { targetType: "chat", targetId: dm.id, reason: "spam" }), reportBody).report.subjectUserId).toBeNull();
  });
});

describe("POST /api/reports/:id/resolve", () => {
  test("права и ошибки: 403 без раздела, неверное действие, 404, повторный разбор", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const legal = await sectionAdmin(baseUrl, await primary(), ["legal"]);
    const reporter = await registerUser(baseUrl);
    const target = await registerUser(baseUrl);
    const { report: r } = expectOk(await report(reporter, { targetType: "user", targetId: target.id, reason: "spam" }), reportBody);

    expectError(await resolve(reporter, r.id, "dismiss"), 403, NO_RIGHTS);
    expectError(await resolve(legal, r.id, "dismiss"), 403, NO_RIGHTS);
    expectError(await resolve(reporter, "rp_nonexistent00", "nope"), 403, NO_RIGHTS);
    expectError(await resolve(m, r.id, "nope"), 400, "invalid action");
    expectError(await resolve(m, r.id, undefined), 400, "invalid action");
    expectError(await resolve(m, "rp_nonexistent00", "dismiss"), 404, "Жалоба не найдена");
    expectError(await resolve(m, r.id, "delete"), 400, "Пользователя нельзя удалить — только заблокировать");

    expect(expectOk(await resolve(m, r.id, "dismiss"), resolveBody)).toEqual({ status: "dismissed" });
    expectError(await resolve(m, r.id, "dismiss"), 400, "Жалоба уже обработана");
    expectError(await resolve(await primary(), r.id, "ban"), 400, "Жалоба уже обработана");
  });

  test("dismiss: карточка в чатах модераторов обновляется (message:updated), жалоба уходит из открытых", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const p = await primary();
    const reporter = await registerUser(baseUrl);
    const target = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [mWs, pWs, outsiderWs, targetWs] = await Promise.all([ws(m.api), ws(p.api), ws(outsider.api), ws(target.api)]);
    const { report: r } = expectOk(await report(reporter, { targetType: "user", targetId: target.id, reason: "fake" }), reportBody);
    const original = await waitReport(mWs, r.id);

    expect(expectOk(await resolve(m, r.id, "dismiss"), resolveBody)).toEqual({ status: "dismissed" });
    for (const socket of [mWs, pWs]) {
      const ev = await socket.waitFor("message:updated", (e) => e.message?.report?.reportId === r.id, 8000);
      expect(expectShape(reportCard, expectShape(message, ev.message).report).status).toBe("dismissed");
    }
    const updated = mWs.events.find((e) => e.type === "message:updated" && e.message?.report?.reportId === r.id)!;
    expect(updated).toMatchObject({ chatId: original.chatId, message: { id: original.id } });
    await outsiderWs.expectNone("message:updated");
    await targetWs.expectNone("message:updated", () => true, 0);

    expect(expectOk(await m.api.get("/api/admin/moderation"), moderationBody).openReports.some((o) => o.id === r.id)).toBe(false);
    const inChat = (await systemMessages(m)).find((msg) => msg.report?.reportId === r.id);
    expect(inChat.report.status).toBe("dismissed");
    // Пользователя не тронули.
    expect((await target.api.get("/api/chats")).status).toBe(200);
  });

  test("delete сообщения: оно пропадает из истории участников", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const reporter = await registerUser(baseUrl);
    const author = await registerUser(baseUrl);
    const group = await createGroup(author, [reporter]);
    const bad = await sendText(author, group.id, "плохое сообщение");
    const reporterWs = await ws(reporter.api);
    const { report: r } = expectOk(await report(reporter, { targetType: "message", targetId: bad.id, reason: "violence" }), reportBody);

    expect(expectOk(await resolve(m, r.id, "delete"), resolveBody)).toEqual({ status: "resolved_deleted" });
    const history = await reporter.api.get(`/api/chats/${group.id}/messages`);
    expect(history.status).toBe(200);
    expect(history.body.messages.some((msg: any) => msg.id === bad.id)).toBe(false);
    // Как при «Удалить у всех»: участникам уходит message:deleted, открытые клиенты убирают сообщение сразу.
    const deleted = await reporterWs.waitFor("message:deleted", (e) => e.id === bad.id);
    expect(deleted).toMatchObject({ chatId: group.id, id: bad.id });
    await reporterWs.expectNone("message:updated", (e) => e.message?.id === bad.id, 0);
  });

  test("delete группы: чат пропадает у участников; по уже удалённой цели — delete и ban по-прежнему работают", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const reporter = await registerUser(baseUrl);
    const owner = await registerUser(baseUrl);
    const group = await createGroup(owner, [reporter], { title: "Под снос" });
    const ownerWs = await ws(owner.api);
    const first = expectOk(await report(reporter, { targetType: "chat", targetId: group.id, reason: "terrorism" }), reportBody).report;
    const second = expectOk(await report(reporter, { targetType: "chat", targetId: group.id, reason: "spam" }), reportBody).report;
    const third = expectOk(await report(reporter, { targetType: "chat", targetId: group.id, reason: "other" }), reportBody).report;

    expect(expectOk(await resolve(m, first.id, "delete"), resolveBody)).toEqual({ status: "resolved_deleted" });
    expect((await owner.api.get(`/api/chats/${group.id}`)).status).toBe(404);
    expect((await reporter.api.get("/api/chats")).body.chats.some((c: any) => c.id === group.id)).toBe(false);
    // ПОВЕДЕНИЕ-ВОПРОС: в отличие от удаления из каталога модерации, здесь нет chat:deleted участникам и уведомления владельцу.
    await ownerWs.expectNone("chat:deleted");

    expect(expectOk(await resolve(m, second.id, "delete"), resolveBody)).toEqual({ status: "resolved_deleted" });
    // Чата уже нет, но бан по такой жалобе работает — по сохранённому subjectUserId (владелец).
    expect(expectOk(await resolve(m, third.id, "ban"), resolveBody)).toEqual({ status: "resolved_banned" });
    expectError(await owner.api.get("/api/chats"), 403, "banned");
  });

  test("ban: блокировка ответственного с причиной из жалобы и меткой по причине", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const reporter = await registerUser(baseUrl);
    const scammer = await registerUser(baseUrl);
    const spammer = await registerUser(baseUrl);
    const dm = await createDm(reporter, scammer);
    const msg = await sendText(scammer, dm.id, "скинь код из смс");
    const scamReport = expectOk(await report(reporter, { targetType: "message", targetId: msg.id, reason: "scam" }), reportBody).report;
    const spamReport = expectOk(await report(reporter, { targetType: "user", targetId: spammer.id, reason: "spam" }), reportBody).report;

    expect(expectOk(await resolve(m, scamReport.id, "ban"), resolveBody)).toEqual({ status: "resolved_banned" });
    const banned = await scammer.api.get("/api/chats");
    expect(banned.status).toBe(403);
    expect(banned.body).toEqual({ error: "banned", banReason: "Жалоба: Мошенничество" });
    expect((await reporter.api.get(`/api/users/${scammer.id}`)).body.user).toMatchObject({ isBanned: true, safetyLabel: "scam" });

    expect(expectOk(await resolve(m, spamReport.id, "ban"), resolveBody)).toEqual({ status: "resolved_banned" });
    const spam = await reporter.api.get(`/api/users/${spammer.id}`);
    expect(spam.body.user).toMatchObject({ isBanned: true });
    // У «спама» нет метки.
    expect(spam.body.user).not.toHaveProperty("safetyLabel");

    const overview = expectOk(await m.api.get("/api/admin/moderation"), moderationBody);
    expect(overview.banned.find((u) => u.id === scammer.id)).toMatchObject({ banReason: "Жалоба: Мошенничество", safetyLabel: "scam" });
  });

  test("ban: уже стоящая метка не перезаписывается", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const reporter = await registerUser(baseUrl);
    const target = await registerUser(baseUrl);
    expect((await m.api.post(`/api/admin/users/${target.id}/label`, { label: "fake" })).status).toBe(200);
    const { report: r } = expectOk(await report(reporter, { targetType: "user", targetId: target.id, reason: "drugs" }), reportBody);
    expect(expectOk(await resolve(m, r.id, "ban"), resolveBody).status).toBe("resolved_banned");
    expect((await reporter.api.get(`/api/users/${target.id}`)).body.user.safetyLabel).toBe("fake");
  });

  test("ban: не на кого (личка без владельца), себя и старших — ошибки, жалоба остаётся открытой", async () => {
    const { baseUrl } = server();
    const m = await mod();
    const p = await primary();
    const reporter = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const dm = await createDm(reporter, other);
    const dmReport = expectOk(await report(reporter, { targetType: "chat", targetId: dm.id, reason: "spam" }), reportBody).report;
    expectError(await resolve(m, dmReport.id, "ban"), 400, "Не удалось определить, кого блокировать");

    const onPrimary = expectOk(await report(reporter, { targetType: "user", targetId: p.id, reason: "spam" }), reportBody).report;
    expectError(await resolve(m, onPrimary.id, "ban"), 403, RANK_ERROR);
    const onSelf = expectOk(await report(reporter, { targetType: "user", targetId: m.id, reason: "spam" }), reportBody).report;
    expectError(await resolve(m, onSelf.id, "ban"), 403, RANK_ERROR);
    // Главный админ банит модератора по жалобе.
    expect(expectOk(await resolve(p, onSelf.id, "ban"), resolveBody).status).toBe("resolved_banned");
    expectError(await m.api.get("/api/chats"), 403, "banned");
    expect((await p.api.post(`/api/admin/users/${m.id}/ban`, { banned: false })).status).toBe(200);

    const open = expectOk(await p.api.get("/api/admin/moderation"), moderationBody).openReports.map((o) => o.id);
    expect(open).toEqual(expect.arrayContaining([dmReport.id, onPrimary.id]));
    expect(open).not.toContain(onSelf.id);
  });
});
