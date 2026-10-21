// Модерация пользователей: поиск (lookup), бан, метки, верификация, статус
// «Разработчик», удаление аккаунта, сброс пароля, обзор модерации и каталог
// (directory). Ранги: модератор не трогает админов своего уровня и выше.
import { describe, expect, test } from "vitest";
import {
  banBody,
  developerBody,
  deleteUserBody,
  directoryChatsBody,
  directoryUsersBody,
  exportsBody,
  labelUserBody,
  lookupBody,
  moderationBody,
  resetPasswordBody,
  userReportsBody,
  verifyUserBody,
} from "../../schemas/admin";
import { sessionBody, twoFactorChallenge } from "../../schemas/auth";
import { message } from "../../schemas/message";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createChannel, createDm, createGroup, login, registerUser, sendText, uniq, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import {
  ADMIN_ENV,
  admins,
  dmWith,
  enableTotp,
  RANK_ERROR,
  sectionAdmin,
  SYSTEM_BOT_ID,
  systemMessages,
  USER_NOT_FOUND,
  waitUntil,
  wsPool,
} from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const ws = wsPool();
const { primary, extra } = admins(() => server().baseUrl);

let mod: TestUser | undefined;
/** Модератор — пользователь с разделом «moderation». */
async function moderator(): Promise<TestUser> {
  mod ??= await sectionAdmin(server().baseUrl, await primary(), ["moderation", "legal"]);
  return mod;
}

const ban = (actor: TestUser, target: { id: string }, body: unknown) => actor.api.post(`/api/admin/users/${target.id}/ban`, body);

describe("GET /api/admin/lookup", () => {
  test("ищет по id, @username, username, телефону и email", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl, { name: "Искомый" });
    const expected = { user: { id: target.id, name: "Искомый", username: target.username, phone: target.phone, email: target.email } };
    for (const q of [target.id, `@${target.username}`, target.username, target.phone, target.email, `  ${target.id}  `]) {
      expect(expectOk(await m.api.get("/api/admin/lookup", { query: { q } }), lookupBody), q).toEqual(expected);
    }
  });

  test("пустой запрос и несуществующий — 404", async () => {
    const m = await moderator();
    expectError(await m.api.get("/api/admin/lookup"), 404, USER_NOT_FOUND);
    expectError(await m.api.get("/api/admin/lookup", { query: { q: "   " } }), 404, USER_NOT_FOUND);
    expectError(await m.api.get("/api/admin/lookup", { query: { q: "nobody@test.invalid" } }), 404, USER_NOT_FOUND);
  });
});

describe("POST /api/admin/users/:id/ban", () => {
  test("бан и разбан: карточка с причиной, сообщения от системного бота, список заблокированных", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl, { name: "Нарушитель" });

    const banned = expectOk(await ban(m, target, { reason: "  спам в группах  " }), banBody).user;
    expect(banned).toMatchObject({ id: target.id, name: "Нарушитель", isBanned: true, banReason: "спам в группах" });
    expect(banned.bannedAt).not.toBeNull();
    expectError(await target.api.get("/api/chats"), 403, "banned");

    const overview = expectOk(await m.api.get("/api/admin/moderation"), moderationBody);
    expect(overview.banned.find((u) => u.id === target.id)).toMatchObject({ isBanned: true, banReason: "спам в группах" });

    const unbanned = expectOk(await ban(m, target, { banned: false }), banBody).user;
    expect(unbanned).toMatchObject({ id: target.id, isBanned: false, bannedAt: null, banReason: null });
    const after = expectOk(await m.api.get("/api/admin/moderation"), moderationBody);
    expect(after.banned.some((u) => u.id === target.id)).toBe(false);

    // Уведомления пользователь видит после разбана — в личке с системным ботом.
    const texts = (await systemMessages(target)).map((msg) => expectShape(message, msg)).map((msg) => [msg.senderId, msg.text]);
    expect(texts).toEqual([
      [SYSTEM_BOT_ID, "🚫 Ваш аккаунт заблокирован администрацией Shalter навсегда.\nПричина: спам в группах"],
      [SYSTEM_BOT_ID, "✅ Блокировка вашего аккаунта снята. Приносим извинения за неудобства."],
    ]);
  });

  test("ошибки: неизвестный, сам себя, без причины", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl);
    expectError(await ban(m, { id: "u_nonexistent00" }, { reason: "x" }), 404, USER_NOT_FOUND);
    expectError(await ban(m, m, { reason: "x" }), 400, "Нельзя заблокировать самого себя");
    expectError(await ban(await primary(), await primary(), { reason: "x" }), 400, "Нельзя заблокировать самого себя");
    const NEED_REASON = "Укажите причину блокировки — её увидит пользователь";
    expectError(await ban(m, target, {}), 400, NEED_REASON);
    expectError(await ban(m, target, { banned: true, reason: "   " }), 400, NEED_REASON);
    // Всё, кроме banned === false, — это бан.
    expectError(await ban(m, target, { banned: 0 }), 400, NEED_REASON);
    expect((await target.api.get("/api/chats")).status).toBe(200);
  });

  test("ранги: модератор не банит админов; дополнительный админ банит модератора, но не главного; главный — всех", async () => {
    const { baseUrl } = server();
    const p = await primary();
    const x = await extra();
    const m = await moderator();
    const otherMod = await sectionAdmin(baseUrl, p, ["giftshop"]);

    expectError(await ban(m, p, { reason: "x" }), 403, RANK_ERROR);
    expectError(await ban(m, x, { reason: "x" }), 403, RANK_ERROR);
    expectError(await ban(m, otherMod, { reason: "x" }), 403, RANK_ERROR);
    expectError(await ban(x, p, { reason: "x" }), 403, RANK_ERROR);

    expectOk(await ban(x, otherMod, { reason: "проверка" }), banBody);
    expectOk(await ban(x, otherMod, { banned: false }), banBody);
    expectOk(await ban(p, x, { reason: "проверка" }), banBody);
    expectOk(await ban(p, x, { banned: false }), banBody);
    expect((await x.api.get("/api/chats")).status).toBe(200);
  });
});

describe("POST /api/admin/users/:id/label", () => {
  test("метка ставится и снимается; видна в профиле и в списке модерации", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl);
    const viewer = await registerUser(baseUrl);

    const labeled = expectOk(await m.api.post(`/api/admin/users/${target.id}/label`, { label: "scam" }), labelUserBody).user;
    expect(labeled).toMatchObject({ id: target.id, safetyLabel: "scam" });
    expect(labeled.safetyLabelAt).not.toBeNull();
    const profile = await viewer.api.get(`/api/users/${target.id}`);
    expect(profile.body.user).toMatchObject({ safetyLabel: "scam" });
    expect(expectOk(await m.api.get("/api/admin/moderation"), moderationBody).labeled.find((u) => u.id === target.id)).toMatchObject({
      safetyLabel: "scam",
    });

    const cleared = expectOk(await m.api.post(`/api/admin/users/${target.id}/label`, { label: "" }), labelUserBody).user;
    expect(cleared).toMatchObject({ safetyLabel: null, safetyLabelAt: null });
    expect((await viewer.api.get(`/api/users/${target.id}`)).body.user).not.toHaveProperty("safetyLabel");
    // Без поля label — тоже снятие.
    expectOk(await m.api.post(`/api/admin/users/${target.id}/label`, { label: "fake" }), labelUserBody);
    expect(expectOk(await m.api.post(`/api/admin/users/${target.id}/label`, {}), labelUserBody).user.safetyLabel).toBeNull();
  });

  test("ошибки: неизвестный пользователь и неизвестная метка", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl);
    expectError(await m.api.post("/api/admin/users/u_nonexistent00/label", { label: "scam" }), 404, USER_NOT_FOUND);
    expectError(await m.api.post(`/api/admin/users/${target.id}/label`, { label: "nope" }), 400, "Неизвестная метка");
  });

  test("ранги: модератор не ставит метки админам, как и с баном; главный — может", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const p = await primary();
    const x = await extra();
    const otherMod = await sectionAdmin(baseUrl, p, ["giftshop"]);
    const label = (by: TestUser, target: TestUser, value: string) => by.api.post(`/api/admin/users/${target.id}/label`, { label: value });
    for (const target of [p, x, otherMod]) {
      expectError(await label(m, target, "scam"), 403, RANK_ERROR);
      expectError(await label(m, target, ""), 403, RANK_ERROR);
    }
    expectError(await label(x, p, "scam"), 403, RANK_ERROR);
    expect((await p.api.get(`/api/users/${p.id}`)).body.user).not.toHaveProperty("safetyLabel");
    expect(expectOk(await label(p, otherMod, "fake"), labelUserBody).user.safetyLabel).toBe("fake");
    expectOk(await label(p, otherMod, ""), labelUserBody);
  });
});

describe("POST /api/admin/users/:id/verify", () => {
  test("галочка ставится и снимается; уведомление от системного бота приходит по WS только адресату", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl);
    const outsider = await registerUser(baseUrl);
    const [targetWs, outsiderWs] = await Promise.all([ws(target.api), ws(outsider.api)]);

    const on = expectOk(await m.api.post(`/api/admin/users/${target.id}/verify`, { verified: true }), verifyUserBody).user;
    expect(on).toMatchObject({ id: target.id, isVerified: true });
    const ev = await targetWs.waitFor("message:new", (e) => e.message?.senderId === SYSTEM_BOT_ID, 8000);
    expect(expectShape(message, ev.message).text).toBe("✅ Ваш аккаунт верифицирован — рядом с именем появилась галочка.");
    await outsiderWs.expectNone("message:new");
    expect((await outsider.api.get(`/api/users/${target.id}`)).body.user).toMatchObject({ isVerified: true });
    // Карточка модерации знает о галочке — по ней кнопка «Снять галочку».
    expect(expectOk(await m.api.get(`/api/admin/users/${target.id}/reports`), userReportsBody).user).toMatchObject({ isVerified: true });

    expect(expectOk(await m.api.post(`/api/admin/users/${target.id}/verify`, {}), verifyUserBody).user.isVerified).toBe(false);
    expect(expectOk(await m.api.get(`/api/admin/users/${target.id}/reports`), userReportsBody).user).toMatchObject({ isVerified: false });
    await targetWs.waitFor("message:new", (e) => e.message?.text === "Отметка о верификации с вашего аккаунта снята.", 8000);
    expect((await outsider.api.get(`/api/users/${target.id}`)).body.user).not.toHaveProperty("isVerified");
    expectError(await m.api.post("/api/admin/users/u_nonexistent00/verify", { verified: true }), 404, USER_NOT_FOUND);
  });
});

describe("POST /api/admin/users/:id/developer", () => {
  test("требует раздел server; ответ — карточка пользователя", async () => {
    const { baseUrl } = server();
    const p = await primary();
    const srv = await sectionAdmin(baseUrl, p, ["server"]);
    const target = await registerUser(baseUrl);
    expectError(await srv.api.post("/api/admin/users/u_nonexistent00/developer", { developer: true }), 404, USER_NOT_FOUND);

    const res = expectOk(await srv.api.post(`/api/admin/users/${target.id}/developer`, { developer: true }), developerBody);
    expect(res.user.id).toBe(target.id);
    // Флаг виден в карточке, в своём профиле и в публичном профиле.
    expect(res.user.isDeveloper).toBe(true);
    expect(expectOk(await target.api.get("/api/auth/session"), sessionBody).user?.isDeveloper).toBe(true);
    expect((await p.api.get(`/api/users/${target.id}`)).body.user?.isDeveloper).toBe(true);
    expect(expectOk(await srv.api.post(`/api/admin/users/${target.id}/developer`, { developer: false }), developerBody).user).not.toHaveProperty(
      "isDeveloper"
    );
    expect(expectOk(await target.api.get("/api/auth/session"), sessionBody).user).not.toHaveProperty("isDeveloper");
    // Админ по номеру — разработчик всегда, и в ответе тоже, даже после снятия флага.
    expect(expectOk(await srv.api.post(`/api/admin/users/${p.id}/developer`, { developer: false }), developerBody).user.isDeveloper).toBe(true);
    expect(expectOk(await p.api.get("/api/auth/session"), sessionBody).user?.isDeveloper).toBe(true);
  });
});

describe("GET /api/admin/users/:id/reports и обзор модерации", () => {
  test("жалобы на пользователя: открытые попадают в обзор, карточка с отправителем и цитатой", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const reporter = await registerUser(baseUrl, { name: "Жалобщик" });
    const target = await registerUser(baseUrl, { name: "Обвиняемый" });
    const dm = await createDm(target, reporter);
    const msg = await sendText(target, dm.id, "купи крипту");

    const r1 = await reporter.api.post("/api/reports", { targetType: "user", targetId: target.id, reason: "fake", details: "  выдаёт себя за другого  " });
    expect(r1.status, r1.text).toBe(200);
    const r2 = await reporter.api.post("/api/reports", { targetType: "message", targetId: msg.id, reason: "scam" });
    expect(r2.status, r2.text).toBe(200);

    const { user, reports } = expectOk(await m.api.get(`/api/admin/users/${target.id}/reports`), userReportsBody);
    expect(user).toMatchObject({ id: target.id, name: "Обвиняемый", bannedAt: null, banReason: null, isBanned: false });
    expect(reports.map((r) => r.id).sort()).toEqual([r1.body.report.id, r2.body.report.id].sort());
    const byId = new Map(reports.map((r) => [r.id, r]));
    expect(byId.get(r1.body.report.id)).toMatchObject({
      status: "open",
      reason: "fake",
      reasonLabel: "Поддельный аккаунт",
      details: "выдаёт себя за другого",
      targetType: "user",
      quoted: null,
      reporter: { id: reporter.id, name: "Жалобщик" },
      subject: { id: target.id, name: "Обвиняемый" },
    });
    expect(byId.get(r2.body.report.id)).toMatchObject({ reasonLabel: "Мошенничество", details: null, targetType: "message", quoted: "купи крипту" });

    const overview = expectOk(await m.api.get("/api/admin/moderation"), moderationBody);
    const ids = overview.openReports.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([r1.body.report.id, r2.body.report.id]));
    expect(overview.labels.map((l) => l.id)).toEqual(expect.arrayContaining(["scam", "fake", "terrorism", "extremism", "drugs"]));

    expectError(await m.api.get("/api/admin/users/u_nonexistent00/reports"), 404, USER_NOT_FOUND);
  });

  test("у пользователя без жалоб — пустой список", async () => {
    const target = await registerUser(server().baseUrl);
    expect(expectOk(await (await moderator()).api.get(`/api/admin/users/${target.id}/reports`), userReportsBody).reports).toEqual([]);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  test("удаление: подтверждение по @username, запись в журнал, сессия и личка исчезают", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl, { name: "Удаляемый" });
    const friend = await registerUser(baseUrl);
    const dm = await createDm(friend, target);
    const group = await createGroup(target, [friend]);
    const targetWs = await ws(target.api);

    const res = await m.api.delete(`/api/admin/users/${target.id}`, { confirm: ` @${target.username.toUpperCase()} `, reason: "  решение суда  " });
    expect(expectOk(res, deleteUserBody)).toEqual({ ok: true, deleted: { id: target.id, name: "Удаляемый", username: target.username } });

    // Сессии удалённого аккаунта отозваны.
    expectError(await target.api.get("/api/chats"), 401, "session_revoked");
    const closed = await Promise.race([targetWs.closed, new Promise<never>((_, r) => setTimeout(() => r(new Error("сокет не закрыт")), 8000))]);
    expect(closed.code).toBe(4001);
    expectError(await m.api.get("/api/admin/lookup", { query: { q: target.id } }), 404, USER_NOT_FOUND);
    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: target.email, password: target.password }), 401, "Неверный email или пароль");

    // Личка удаляется, группа остаётся с оставшимися участниками и новым владельцем.
    expect(await dmWith(friend, target.id)).toBeNull();
    expect((await friend.api.get(`/api/chats/${dm.id}`)).status).toBe(404);
    const g = await friend.api.get(`/api/chats/${group.id}`);
    expect(g.status).toBe(200);
    expect(g.body.chat).toMatchObject({ memberIds: [friend.id], ownerId: friend.id });

    const log = expectOk(await m.api.get("/api/admin/exports"), exportsBody).exports;
    expect(log.find((e) => e.target.id === target.id)).toMatchObject({
      reason: `УДАЛЕНИЕ АККАУНТА @${target.username} (Удаляемый): решение суда`,
      messageCount: 0,
      admin: { id: m.id, name: m.name },
      target: { id: target.id },
    });
  });

  test("ошибки по порядку проверок: 404, свой аккаунт, служебный, ранг, подтверждение, основание", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const p = await primary();
    const target = await registerUser(baseUrl);
    const del = (actor: TestUser, id: string, body: unknown) => actor.api.delete(`/api/admin/users/${id}`, body);

    expectError(await del(m, "u_nonexistent00", {}), 404, USER_NOT_FOUND);
    expectError(await del(m, m.id, { confirm: m.username, reason: "x" }), 400, "Свой аккаунт удаляется в настройках — там же, где у всех");
    expectError(await del(m, SYSTEM_BOT_ID, { confirm: "x", reason: "x" }), 400, "Служебные аккаунты Shalter удалять нельзя");
    expectError(await del(m, p.id, { confirm: p.username, reason: "x" }), 403, RANK_ERROR);
    expectError(await del(m, target.id, { confirm: "кто-то", reason: "x" }), 400, `Для подтверждения введите @${target.username}`);
    expectError(await del(m, target.id, { confirm: target.username }), 400, "Укажите основание — оно попадёт в журнал");
    expect((await target.api.get("/api/chats")).status).toBe(200);
  });
});

describe("POST /api/admin/users/:id/reset-password", () => {
  const reset = (actor: TestUser, id: string, body: unknown) => actor.api.post(`/api/admin/users/${id}/reset-password`, body);

  test("сброс: сеансы завершены, старый пароль не подходит, новый подходит, уведомление в чате с ботом", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const target = await registerUser(baseUrl);
    const second = await login(baseUrl, target);

    const res = await reset(m, target.id, { confirm: target.username, reason: "обращение в поддержку", password: "brand-new-1" });
    expect(expectOk(res, resetPasswordBody)).toEqual({ ok: true, twoFactorLifted: false });

    expectError(await target.api.get("/api/chats"), 401, "session_revoked");
    expectError(await second.get("/api/chats"), 401, "session_revoked");
    expectError(await new Api(baseUrl).post("/api/auth/login-email", { email: target.email, password: target.password }), 401, "Неверный email или пароль");
    const fresh = await login(baseUrl, { email: target.email, password: "brand-new-1" });
    const texts = (await systemMessages(fresh)).map((msg) => msg.text);
    // Рядом — уведомления о входе с нового устройства (второй login).
    expect(texts).toContain(
      "🔐 Администрация Shalter сбросила пароль вашего аккаунта.\nОснование: обращение в поддержку\n\nВсе сеансы завершены.\n\nЕсли вы этого не просили — немедленно смените пароль в настройках."
    );

    const log = expectOk(await m.api.get("/api/admin/exports"), exportsBody).exports;
    expect(log.some((e) => e.target.id === target.id && e.reason === `СБРОС ПАРОЛЯ @${target.username} (${target.name}): обращение в поддержку`)).toBe(true);
  });

  test("disableTwoFactor снимает 2FA только если просили; без флага вход по-прежнему требует код", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const keep = await registerUser(baseUrl);
    await enableTotp(keep);
    expect(expectOk(await reset(m, keep.id, { confirm: keep.username, reason: "x", password: "pass-keep-1" }), resetPasswordBody).twoFactorLifted).toBe(false);
    expectShape(twoFactorChallenge, (await new Api(baseUrl).post("/api/auth/login-email", { email: keep.email, password: "pass-keep-1" })).body);

    const lift = await registerUser(baseUrl);
    await enableTotp(lift);
    const res = await reset(m, lift.id, { confirm: lift.username, reason: "потерял телефон", password: "pass-lift-1", disableTwoFactor: true });
    expect(expectOk(res, resetPasswordBody)).toEqual({ ok: true, twoFactorLifted: true });
    const api = await login(baseUrl, { email: lift.email, password: "pass-lift-1" });
    expect(expectOk(await api.get("/api/auth/session"), sessionBody).user).toMatchObject({ id: lift.id, twoFactorEnabled: false });
    // В чате с ботом есть и другие уведомления (включение 2FA, вход с нового устройства).
    const notice = (await systemMessages(api)).find((msg) => msg.text?.startsWith("🔐 Администрация Shalter сбросила пароль"));
    expect(notice?.text).toContain("\nДвухфакторная аутентификация снята — включите её заново: Настройки → Конфиденциальность.");

    // Флаг без включённой 2FA — twoFactorLifted: false.
    const plain = await registerUser(baseUrl);
    expect(expectOk(await reset(m, plain.id, { confirm: plain.username, reason: "x", password: "pass-plain-1", disableTwoFactor: true }), resetPasswordBody).twoFactorLifted).toBe(false);
  });

  test("ошибки: 404, бот, ранг, подтверждение, основание, короткий пароль", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const p = await primary();
    const target = await registerUser(baseUrl);
    const owner = await registerUser(baseUrl);
    const bot = await owner.api.post("/api/bots", { name: "Сбрособот" });
    expect(bot.status, bot.text).toBe(200);

    expectError(await reset(m, "u_nonexistent00", {}), 404, USER_NOT_FOUND);
    expectError(await reset(m, bot.body.bot.user.id, {}), 400, "У ботов нет пароля — им управляет владелец через токен");
    expectError(await reset(m, p.id, { confirm: p.username, reason: "x", password: "123456" }), 403, RANK_ERROR);
    expectError(await reset(m, target.id, { confirm: "", reason: "x", password: "123456" }), 400, `Для подтверждения введите @${target.username}`);
    expectError(await reset(m, target.id, { confirm: target.username, reason: " ", password: "123456" }), 400, "Укажите основание — оно попадёт в журнал");
    expectError(await reset(m, target.id, { confirm: target.username, reason: "x", password: "12345" }), 400, "Пароль — не короче 6 символов");
    expect((await target.api.get("/api/chats")).status).toBe(200);
  });

  test("модератор может сбросить пароль самому себе — ранг для себя не проверяется", async () => {
    const { baseUrl } = server();
    const self = await sectionAdmin(baseUrl, await primary(), ["moderation"]);
    const res = await reset(self, self.id, { confirm: self.username, reason: "сам", password: "self-pass-1" });
    expect(expectOk(res, resetPasswordBody)).toEqual({ ok: true, twoFactorLifted: false });
    expectError(await self.api.get("/api/chats"), 401, "session_revoked");
  });
});

describe("GET /api/admin/directory", () => {
  test("пользователи, боты, группы и каналы с поиском; неизвестный type — пользователи", async () => {
    const { baseUrl } = server();
    const m = await moderator();
    const tag = uniq("dir");
    const alice = await registerUser(baseUrl, { name: `Алиса ${tag}` });
    const bob = await registerUser(baseUrl, { name: `Боб ${tag}` });
    expectOk(await m.api.post(`/api/admin/users/${bob.id}/ban`, { reason: "x" }), banBody);
    const botRes = await alice.api.post("/api/bots", { name: `Бот ${tag}` });
    expect(botRes.status, botRes.text).toBe(200);
    const group = await createGroup(alice, [bob], { title: `Группа ${tag}` });
    const channel = await createChannel(alice, [], { title: `Канал ${tag}` });

    const users = expectOk(await m.api.get("/api/admin/directory", { query: { q: tag.toUpperCase() } }), directoryUsersBody);
    expect(users).toEqual({
      total: 2,
      items: [
        { kind: "user", id: alice.id, name: `Алиса ${tag}`, username: alice.username, phone: alice.phone, email: alice.email, isBanned: false, isSystem: false },
        { kind: "user", id: bob.id, name: `Боб ${tag}`, username: bob.username, phone: bob.phone, email: bob.email, isBanned: true, isSystem: false },
      ],
    });
    // Поиск по телефону и email.
    expect(expectOk(await m.api.get("/api/admin/directory", { query: { q: alice.phone } }), directoryUsersBody).items.map((i) => i.id)).toEqual([alice.id]);
    expect(expectOk(await m.api.get("/api/admin/directory", { query: { type: "nope", q: bob.email } }), directoryUsersBody).items.map((i) => i.id)).toEqual([bob.id]);

    const bots = expectOk(await m.api.get("/api/admin/directory", { query: { type: "bots", q: tag } }), directoryUsersBody);
    expect(bots).toMatchObject({ total: 1, items: [{ kind: "bot", id: botRes.body.bot.user.id, name: `Бот ${tag}`, phone: null, email: null, isSystem: false }] });
    const system = expectOk(await m.api.get("/api/admin/directory", { query: { type: "bots" } }), directoryUsersBody);
    expect(system.items.find((i) => i.id === SYSTEM_BOT_ID)).toMatchObject({ kind: "bot", isSystem: true });

    const groups = expectOk(await m.api.get("/api/admin/directory", { query: { type: "groups", q: `группа ${tag}` } }), directoryChatsBody);
    expect(groups).toEqual({ total: 1, items: [{ kind: "group", id: group.id, title: `Группа ${tag}`, username: null, members: 2, isVerified: false }] });
    // У канала автоматически появляется группа обсуждения — она тоже группа.
    const discussion = expectOk(await m.api.get("/api/admin/directory", { query: { type: "groups", q: tag } }), directoryChatsBody);
    expect(discussion.items.map((i) => i.title).sort()).toEqual([`Группа ${tag}`, `Канал ${tag} · Обсуждение`]);
    const channels = expectOk(await m.api.get("/api/admin/directory", { query: { type: "channels", q: tag } }), directoryChatsBody);
    expect(channels).toEqual({ total: 1, items: [{ kind: "channel", id: channel.id, title: `Канал ${tag}`, username: null, members: 1, isVerified: false }] });

    const all = expectOk(await m.api.get("/api/admin/directory"), directoryUsersBody);
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.items.every((i) => i.kind === "user")).toBe(true);
  });
});
