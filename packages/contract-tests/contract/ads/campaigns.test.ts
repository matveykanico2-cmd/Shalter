// Рекламные кампании за звёзды: CRUD, бюджет, состояния, статистика (владелец),
// модерация (GET/POST /api/ads/review), показ (GET /serve) и клики (POST /click/:id).
//
// Объявления выбираются случайно среди активных на месте показа, поэтому каждый
// сценарий показа работает на своём месте (chats / chat / profile), а discover
// в этом файле активных кампаний не получает.
import { describe, expect, test } from "vitest";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { wsMessageNew } from "../../schemas/messages";
import { budgetBody, campaign, campaignBody, campaignsBody, clickBody, reviewListBody, serveBody, statsBody } from "../../schemas/ads";
import { registerPremiumUser } from "../chats/helpers";
import { socketPool } from "../ws/helpers";
import { ADMIN_ENV, NO_CAMPAIGN, NO_RIGHTS, PLACEMENT_TITLES, activeCampaign, adminGetter, createCampaign, grantStars } from "./helpers";

const server = useServer({ env: ADMIN_ENV });
const open = socketPool();
const getAdmin = adminGetter(() => server().baseUrl);
const newUser = () => registerUser(server().baseUrl);

const reviewNotice = (ownerName: string, title: string, text: string, url?: string) =>
  `📢 Объявление на проверку от ${ownerName}\n«${title}»\n${text}` + (url ? `\nСсылка: ${url}` : "") + "\n\nПроверить: Настройки → Модерация → Реклама на проверке.";

describe("GET/POST /api/ads/campaigns", () => {
  test("пустой кабинет: кампаний нет, баланс, места показа, минимальная цена", async () => {
    const u = await newUser();
    expect(expectOk(await u.api.get("/api/ads/campaigns"), campaignsBody)).toEqual({
      campaigns: [],
      balanceStars: 0,
      placements: PLACEMENT_TITLES,
      cpmMin: 5,
    });
  });

  test("создание: значения по умолчанию, статус review, уведомление админу от системного бота", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl, { name: "Рекламщик" });
    const adminWs = await open(admin.api);

    expectError(await u.api.post("/api/ads/campaigns", {}), 400, "Напишите текст объявления");
    expectError(await u.api.post("/api/ads/campaigns", { text: "   " }), 400, "Напишите текст объявления");

    const before = Date.now();
    const { campaign: c } = expectOk(await u.api.post("/api/ads/campaigns", { text: "  Слоны недорого  " }), campaignBody);
    expect(c).toEqual({
      id: expect.any(String),
      ownerId: u.id,
      title: "Без названия",
      text: "Слоны недорого",
      url: null,
      imageUrl: null,
      placement: "discover",
      placements: ["discover"],
      status: "review",
      rejectReason: null,
      budgetStars: 0,
      spentStars: 0,
      cpmStars: 20,
      impressions: 0,
      clicks: 0,
      createdAt: expect.any(String),
      updatedAt: null,
      remainingStars: 0,
    });
    expect(Date.parse(c.createdAt)).toBeGreaterThanOrEqual(before - 1000);

    const e = await adminWs.waitFor("message:new", (x) => x.message?.text === reviewNotice("Рекламщик", "Без названия", "Слоны недорого"), 10_000);
    expectShape(wsMessageNew, e);
    expect(e.message.senderId).not.toBe(u.id);

    // Админу о собственной кампании не пишут.
    adminWs.clear();
    await createCampaign(admin, { title: "Своя" });
    await adminWs.expectNone("message:new", (x) => typeof x.message?.text === "string" && x.message.text.startsWith("📢 Объявление на проверку"));
  });

  test("поля: обрезка длины, места показа (несколько / legacy placement / неизвестные), минимальная цена", async () => {
    const u = await newUser();
    const c = await createCampaign(u, {
      title: "з".repeat(80),
      text: "т".repeat(250),
      url: `  https://shop.test.invalid/${"x".repeat(400)}`,
      imageUrl: " https://img.test.invalid/a.jpg ",
      placements: ["chats", "bogus", "profile", "chats"],
      cpmStars: 1,
    });
    expect(c.title).toBe("з".repeat(60));
    expect(c.text).toBe("т".repeat(200));
    expect(c.url).toHaveLength(300);
    expect(c.imageUrl).toBe("https://img.test.invalid/a.jpg");
    expect(c).toMatchObject({ placement: "chats,profile", placements: ["chats", "profile"], cpmStars: 5 });

    expect(await createCampaign(u, { placement: "chat", cpmStars: "abc" })).toMatchObject({ placements: ["chat"], cpmStars: 20 });
    expect(await createCampaign(u, { placements: ["bogus"], cpmStars: 50 })).toMatchObject({ placements: ["discover"], cpmStars: 50 });
    // Имена из прототипа объекта — тоже неизвестные места.
    expect(await createCampaign(u, { placements: ["constructor", "__proto__", "toString"] })).toMatchObject({ placement: "discover" });

    // Список — свои кампании, новые сверху; чужих не видно.
    const list = expectOk(await u.api.get("/api/ads/campaigns"), campaignsBody).campaigns;
    expect(list).toHaveLength(4);
    expect(list[3].id).toBe(c.id);
    expect(expectOk(await (await newUser()).api.get("/api/ads/campaigns"), campaignsBody).campaigns).toEqual([]);
  });
});

describe("PATCH/DELETE /api/ads/campaigns/:id", () => {
  test("правка: название не меняет статус; текст после одобрения — снова на проверку", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl, { name: "Правщик" });
    const c = await createCampaign(u, { title: "Старое" });

    const renamed = expectOk(await u.api.patch(`/api/ads/campaigns/${c.id}`, { title: "  Новое  ", cpmStars: 2, placements: ["chat", "x"] }), campaignBody).campaign;
    expect(renamed).toMatchObject({ title: "Новое", status: "review", cpmStars: 5, placements: ["chat"], updatedAt: expect.any(String) });

    // Отклонили → правка текста возвращает на проверку и сбрасывает причину.
    await admin.api.post(`/api/ads/review/${c.id}`, { approve: false, reason: "Грубо" });
    const adminWs = await open(admin.api);
    const fixed = expectOk(await u.api.patch(`/api/ads/campaigns/${c.id}`, { text: "Вежливо", url: "https://shop.test.invalid" }), campaignBody).campaign;
    expect(fixed).toMatchObject({ text: "Вежливо", url: "https://shop.test.invalid", status: "review", rejectReason: null });
    await adminWs.waitFor("message:new", (x) => x.message?.text === reviewNotice("Правщик", "Новое", "Вежливо", "https://shop.test.invalid"), 10_000);

    // Пустые url/imageUrl → null; нестроки игнорируются.
    const cleared = expectOk(await u.api.patch(`/api/ads/campaigns/${c.id}`, { url: " ", imageUrl: "", title: 5 }), campaignBody).campaign;
    expect(cleared).toMatchObject({ url: null, imageUrl: null, title: "Новое" });
  });

  test("PATCH не принимает пустой текст объявления — как и создание", async () => {
    const u = await newUser();
    const c = await createCampaign(u);
    expectError(await u.api.patch(`/api/ads/campaigns/${c.id}`, { text: "   " }), 400, "Напишите текст объявления");
    expectError(await u.api.patch(`/api/ads/campaigns/${c.id}`, { text: "", title: "Новое" }), 400, "Напишите текст объявления");
    // Ничего не поменялось.
    const list = expectOk(await u.api.get("/api/ads/campaigns"), campaignsBody).campaigns;
    expect(list.find((x) => x.id === c.id)).toMatchObject({ text: c.text, title: c.title });
  });

  test("чужая и несуществующая кампания — 404 на всех маршрутах владельца; удаление", async () => {
    const owner = await newUser();
    const other = await newUser();
    const c = await createCampaign(owner);
    for (const id of [c.id, "ad_1_none"]) {
      expectError(await other.api.patch(`/api/ads/campaigns/${id}`, { title: "x" }), 404, NO_CAMPAIGN);
      expectError(await other.api.delete(`/api/ads/campaigns/${id}`), 404, NO_CAMPAIGN);
      expectError(await other.api.post(`/api/ads/campaigns/${id}/budget`, { stars: 1 }), 404, NO_CAMPAIGN);
      expectError(await other.api.post(`/api/ads/campaigns/${id}/status`, { status: "paused" }), 404, NO_CAMPAIGN);
      expectError(await other.api.get(`/api/ads/campaigns/${id}/stats`), 404, NO_CAMPAIGN);
    }
    expectOk(await owner.api.delete(`/api/ads/campaigns/${c.id}`), okBody);
    expectError(await owner.api.get(`/api/ads/campaigns/${c.id}/stats`), 404, NO_CAMPAIGN);
    expect(expectOk(await owner.api.get("/api/ads/campaigns"), campaignsBody).campaigns).toEqual([]);
  });
});

describe("бюджет и состояния", () => {
  test("POST /budget: звёзды списываются с баланса; 0 — 400; не хватает — 402", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    const c = await createCampaign(u);
    for (const stars of [0, -5, "abc", 0.5]) {
      expectError(await u.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars }), 400, "Сколько звёзд добавить?");
    }
    expectError(await u.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: 10 }), 402, "Не хватает звёзд на балансе");

    await grantStars(admin, u, 100);
    const res = expectOk(await u.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: 30.7 }), budgetBody);
    expect(res).toMatchObject({ balanceStars: 70, campaign: { budgetStars: 30, remainingStars: 30, spentStars: 0 } });
    expectError(await u.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: 71 }), 402, "Не хватает звёзд на балансе");
    expect(expectOk(await u.api.get("/api/ads/campaigns"), campaignsBody).balanceStars).toBe(70);
  });

  test("POST /status: active только из paused/finished и с бюджетом; неизвестное — 400", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    const c = await createCampaign(u, { placement: "chat" });
    const status = (s: unknown) => u.api.post(`/api/ads/campaigns/${c.id}/status`, { status: s });

    expectError(await status("active"), 400, "Сначала отправьте объявление на проверку");
    expectError(await status("bogus"), 400, "Неизвестное состояние");
    expectError(await status(undefined), 400, "Неизвестное состояние");

    await admin.api.post(`/api/ads/review/${c.id}`, { approve: true });
    expectError(await status("active"), 402, "Бюджет израсходован — пополните его");
    await grantStars(admin, u, 5);
    await u.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: 5 });
    expect(expectOk(await status("active"), campaignBody).campaign.status).toBe("active");
    expect(expectOk(await status("paused"), campaignBody).campaign.status).toBe("paused");

    const adminWs = await open(admin.api);
    expect(expectOk(await status("review"), campaignBody).campaign).toMatchObject({ status: "review", rejectReason: null });
    await adminWs.waitFor("message:new", (x) => typeof x.message?.text === "string" && x.message.text.includes(c.text), 10_000);
  });

  test("модерацию не обойти: из review/rejected нельзя ни на паузу, ни в показ", async () => {
    const admin = await getAdmin();
    const u = await newUser();
    const c = await createCampaign(u, { placement: "chat" });
    const status = (s: string) => u.api.post(`/api/ads/campaigns/${c.id}/status`, { status: s });
    await grantStars(admin, u, 1);
    await u.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: 1 });
    // На проверке.
    expectError(await status("paused"), 400, "Сначала отправьте объявление на проверку");
    expectError(await status("active"), 400, "Сначала отправьте объявление на проверку");
    // Отклонено.
    await admin.api.post(`/api/ads/review/${c.id}`, { approve: false, reason: "Нельзя" });
    expectError(await status("paused"), 400, "Сначала отправьте объявление на проверку");
    expectError(await status("active"), 400, "Сначала отправьте объявление на проверку");
    const mine = expectOk(await u.api.get("/api/ads/campaigns"), campaignsBody).campaigns.find((x: any) => x.id === c.id);
    expect(mine).toMatchObject({ status: "rejected", rejectReason: "Нельзя" });
  });
});

describe("модерация /api/ads/review", () => {
  test("не модератору — 403", async () => {
    const u = await newUser();
    const c = await createCampaign(u);
    expectError(await u.api.get("/api/ads/review"), 403, NO_RIGHTS);
    expectError(await u.api.post(`/api/ads/review/${c.id}`, { approve: true }), 403, NO_RIGHTS);
  });

  test("список на проверке с владельцем; одобрение → paused, отказ → rejected с причиной; владельцу пишет бот", async () => {
    const admin = await getAdmin();
    const u = await registerUser(server().baseUrl, { name: "Владелец" });
    const ok = await createCampaign(u, { title: "Хорошее" });
    const bad = await createCampaign(u, { text: "Плохое объявление без названия" });
    const ws = await open(u.api);

    const list = expectOk(await admin.api.get("/api/ads/review"), reviewListBody);
    expect(list.placements).toEqual(PLACEMENT_TITLES);
    expect(list.campaigns.every((x: any) => x.status === "review")).toBe(true);
    const mine = list.campaigns.filter((x: any) => x.ownerId === u.id);
    // По возрастанию даты создания.
    expect(mine.map((x: any) => x.id)).toEqual([ok.id, bad.id]);
    expect(mine[0].owner).toEqual({ id: u.id, name: "Владелец", username: u.username });

    expectError(await admin.api.post("/api/ads/review/ad_1_none", { approve: true }), 404, NO_CAMPAIGN);
    expectError(await admin.api.post(`/api/ads/review/${bad.id}`, { approve: false }), 400, "Укажите причину отказа — её увидит рекламодатель");
    expectError(await admin.api.post(`/api/ads/review/${bad.id}`, { approve: false, reason: "   " }), 400, "Укажите причину отказа — её увидит рекламодатель");

    const approved = expectOk(await admin.api.post(`/api/ads/review/${ok.id}`, {}), campaignBody).campaign;
    expect(approved).toMatchObject({ status: "paused", rejectReason: null });
    let e = await ws.waitFor("message:new", (x) => typeof x.message?.text === "string" && x.message.text.startsWith("✅"), 10_000);
    expectShape(wsMessageNew, e);
    expect(e.message.text).toBe("✅ Объявление «Хорошее» проверено и допущено к показу.\n\nВключите его в кабинете рекламы, когда будете готовы.");

    const rejected = expectOk(await admin.api.post(`/api/ads/review/${bad.id}`, { approve: false, reason: " Обман " }), campaignBody).campaign;
    expect(rejected).toMatchObject({ status: "rejected", rejectReason: "Обман" });
    e = await ws.waitFor("message:new", (x) => typeof x.message?.text === "string" && x.message.text.startsWith("⛔"), 10_000);
    // Пустое название сохраняется как «Без названия», поэтому запасной вариант (30 символов текста) не срабатывает.
    expect(e.message.text).toBe("⛔ Объявление «Без названия» отклонено.\nПричина: Обман\n\nИсправьте текст и отправьте на проверку снова.");

    const after = expectOk(await admin.api.get("/api/ads/review"), reviewListBody).campaigns.map((x: any) => x.id);
    expect(after).not.toContain(ok.id);
    expect(after).not.toContain(bad.id);
    expect(expectOk(await u.api.get(`/api/ads/campaigns/${bad.id}/stats`), statsBody).campaign).toMatchObject({ status: "rejected", rejectReason: "Обман" });
  });
});

describe("показ и клики", () => {
  test("GET /serve: чужая активная кампания, свою не показывают, Premium — без рекламы; показы и клики в статистике", async () => {
    const admin = await getAdmin();
    const owner = await newUser();
    const viewer = await newUser();
    const premium = await registerPremiumUser(server().baseUrl);
    const c = await activeCampaign(admin, owner, { placement: "chats", title: "Слоны", url: "https://shop.test.invalid", imageUrl: "https://img.test.invalid/e.jpg" }, 10);
    expectShape(campaign, c);

    const served = expectOk(await viewer.api.get("/api/ads/serve", { query: { placement: "chats" } }), serveBody);
    expect(served).toEqual({ ad: { id: c.id, title: "Слоны", text: c.text, url: "https://shop.test.invalid", imageUrl: "https://img.test.invalid/e.jpg" } });
    expect(expectOk(await owner.api.get("/api/ads/serve", { query: { placement: "chats" } }), serveBody)).toEqual({ ad: null });
    expect(expectOk(await premium.api.get("/api/ads/serve", { query: { placement: "chats" } }), serveBody)).toEqual({ ad: null, premium: true });
    // Неизвестное место — как discover, а там активных нет.
    expect(expectOk(await viewer.api.get("/api/ads/serve", { query: { placement: "bogus" } }), serveBody)).toEqual({ ad: null });
    expect(expectOk(await viewer.api.get("/api/ads/serve"), serveBody)).toEqual({ ad: null });
    expect(expectOk(await viewer.api.get("/api/ads/serve", { query: { placement: "constructor" } }), serveBody)).toEqual({ ad: null });

    // Клик: чужой засчитывается, свой — нет; ответ — адрес перехода.
    expect(expectOk(await viewer.api.post(`/api/ads/click/${c.id}`), clickBody)).toEqual({ ok: true, url: "https://shop.test.invalid" });
    expect(expectOk(await owner.api.post(`/api/ads/click/${c.id}`), clickBody)).toEqual({ ok: true, url: "https://shop.test.invalid" });
    expectError(await viewer.api.post("/api/ads/click/ad_1_none"), 404, "not found");

    const stats = expectOk(await owner.api.get(`/api/ads/campaigns/${c.id}/stats`), statsBody);
    expect(stats.campaign).toMatchObject({ impressions: 1, clicks: 1, spentStars: 0, status: "active" });
    expect(stats.daily).toEqual([{ campaignId: c.id, day: new Date().toISOString().slice(0, 10), impressions: 1, clicks: 1, spentStars: 0 }]);
  });

  test("оплата за тысячу показов: бюджет кончился — finished, показ прекращается; пополнили — снова active", async () => {
    const admin = await getAdmin();
    const owner = await newUser();
    const viewer = await newUser();
    // 1000 звёзд за тысячу показов = звезда за показ.
    const c = await activeCampaign(admin, owner, { placement: "chat", cpmStars: 1000 }, 2);
    for (let i = 0; i < 2; i++) {
      expect(expectOk(await viewer.api.get("/api/ads/serve", { query: { placement: "chat" } }), serveBody).ad?.id).toBe(c.id);
    }
    expect(expectOk(await viewer.api.get("/api/ads/serve", { query: { placement: "chat" } }), serveBody)).toEqual({ ad: null });
    const { campaign: done, daily } = expectOk(await owner.api.get(`/api/ads/campaigns/${c.id}/stats`), statsBody);
    expect(done).toMatchObject({ status: "finished", impressions: 2, spentStars: 2, budgetStars: 2, remainingStars: 0 });
    expect(daily[0]).toMatchObject({ impressions: 2, spentStars: 2, clicks: 0 });

    expectError(await owner.api.post(`/api/ads/campaigns/${c.id}/status`, { status: "active" }), 402, "Бюджет израсходован — пополните его");
    await grantStars(admin, owner, 1);
    await owner.api.post(`/api/ads/campaigns/${c.id}/budget`, { stars: 1 });
    expect(expectOk(await owner.api.post(`/api/ads/campaigns/${c.id}/status`, { status: "active" }), campaignBody).campaign).toMatchObject({ status: "active", remainingStars: 1 });
    await owner.api.post(`/api/ads/campaigns/${c.id}/status`, { status: "paused" });
  });

  test("место profile: только с owner; Premium тоже видит; один зритель оплачивается раз в окно, владелец — никогда", async () => {
    const admin = await getAdmin();
    const owner = await newUser();
    const [v1, v2] = [await newUser(), await newUser()];
    const premium = await registerPremiumUser(server().baseUrl);
    const c = await activeCampaign(admin, owner, { placement: "profile" }, 10);
    const serve = (u: typeof owner, ownerId?: string) => u.api.get("/api/ads/serve", { query: { placement: "profile", owner: ownerId } });

    expect(expectOk(await serve(v1), serveBody)).toEqual({ ad: null });
    expect(expectOk(await serve(v1, v2.id), serveBody)).toEqual({ ad: null });
    for (let i = 0; i < 3; i++) expect(expectOk(await serve(v1, owner.id), serveBody).ad?.id).toBe(c.id);
    expect(expectOk(await serve(v2, owner.id), serveBody).ad?.id).toBe(c.id);
    expect(expectOk(await serve(premium, owner.id), serveBody).ad?.id).toBe(c.id);
    expect(expectOk(await serve(owner, owner.id), serveBody).ad?.id).toBe(c.id);

    // v1 — один раз, v2 и premium — по разу, владелец не оплачивается.
    expect(expectOk(await owner.api.get(`/api/ads/campaigns/${c.id}/stats`), statsBody).campaign.impressions).toBe(3);
  });
});
