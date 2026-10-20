// Настройки пользователя (server/routes/settings.js): весь объект настроек,
// слияние PATCH, нормализация приватности, праздников и бизнес-настроек, запрет
// украинского языка интерфейса и подсчёт занятого места (GET /storage).
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, login, registerUser, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { fakeUploadUrl, uploadedUrl } from "../users/helpers";
import { settingsGetBody, settingsPatchBody, storageBody } from "../../schemas/settings";
import { socketPool } from "../ws/helpers";

const server = useServer();
const open = socketPool();

const DEFAULT_HOURS = { closed: false, open: "09:00", close: "18:00" };

describe("без сессии", () => {
  test.each([
    ["GET", "/api/settings"],
    ["GET", "/api/settings/storage"],
    ["PATCH", "/api/settings"],
  ])("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("GET /api/settings", () => {
  test("новый пользователь — значения по умолчанию и каталог праздников", async () => {
    const me = await registerUser(server().baseUrl);
    const body = expectOk(await me.api.get("/api/settings"), settingsGetBody);
    expect(body.holidayCatalog).toEqual([{ id: "shalter_day", title: "День основания Shalter", date: "09-25" }]);
    expect(body.settings).toEqual({
      theme: "system",
      accent: "",
      reduceMotion: false,
      fontSize: 15,
      requirePasswordOnLaunch: false,
      pinnedChannelIds: [],
      notifications: { previewText: true, sound: true, mutedChats: {} },
      privacy: {
        lastSeen: "everyone",
        phone: "contacts",
        discoverByPhone: "everyone",
        photo: "everyone",
        bio: "everyone",
        birthday: "everyone",
        forwards: "everyone",
        invites: "everyone",
        calls: "everyone",
        botMessages: "everyone",
        storiesArchive: "nobody",
        exceptions: {},
      },
      chatWallpaper: "default",
      chatWallpaperImage: null,
      homeWallpaper: false,
      translateLanguage: "ru",
      uiLanguage: "ru",
      autoDownload: true,
      voiceTranscription: false,
      chatClears: {},
      hiddenChats: {},
      chatWallpapers: {},
      drafts: {},
      holidays: { disabled: [], custom: [] },
      business: {
        enabled: false,
        hours: {
          mon: DEFAULT_HOURS,
          tue: DEFAULT_HOURS,
          wed: DEFAULT_HOURS,
          thu: DEFAULT_HOURS,
          fri: DEFAULT_HOURS,
          sat: { ...DEFAULT_HOURS, closed: true },
          sun: { ...DEFAULT_HOURS, closed: true },
        },
        timeZone: null,
        showHours: true,
        greeting: { enabled: false, text: "", attachments: [] },
        away: { enabled: false, text: "", attachments: [] },
        quickReplies: [],
      },
    });
  });

  test("у каждого — свои настройки", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    await a.api.patch("/api/settings", { theme: "dark" });
    expect((await b.api.get("/api/settings")).body.settings.theme).toBe("system");
  });
});

describe("PATCH /api/settings", () => {
  test("слияние по верхнему уровню: прочие ключи сохраняются, вложенный объект заменяется целиком", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const res = expectOk(await me.api.patch("/api/settings", { theme: "dark", fontSize: 17, accent: "#ff0000" }), settingsPatchBody);
    expect(res.settings).toMatchObject({ theme: "dark", fontSize: 17, accent: "#ff0000", uiLanguage: "ru" });
    expect((await me.api.get("/api/settings")).body.settings).toMatchObject({ theme: "dark", fontSize: 17 });

    const next = expectOk(await me.api.patch("/api/settings", { notifications: { sound: false } }), settingsPatchBody).settings;
    // ПОВЕДЕНИЕ-ВОПРОС: вложенные объекты не сливаются — PATCH notifications без mutedChats/previewText
    // стирает их (клиент обязан присылать объект целиком).
    expect(next.notifications).toEqual({ sound: false });
    expect(next.theme).toBe("dark");

    // Пустое тело — 200, без изменений.
    expect(expectOk(await me.api.patch("/api/settings"), settingsPatchBody).settings.theme).toBe("dark");
  });

  test("ключи и типы верхнего уровня не проверяются", async () => {
    const me = await registerUser(server().baseUrl);
    const res = await me.api.patch("/api/settings", { theme: 5, somethingElse: { deep: true } });
    expect(res.status).toBe(200);
    // ПОВЕДЕНИЕ-ВОПРОС: PATCH /api/settings сохраняет любые ключи и значения любого типа без белого списка —
    // тело-массив тоже записывается (ключи «0», «1»).
    expect(res.body.settings).toMatchObject({ theme: 5, somethingElse: { deep: true } });
    expect((await me.api.patch("/api/settings", ["a", "b"])).body.settings).toMatchObject({ 0: "a", 1: "b", theme: 5 });
  });

  test("privacy: исключения нормализуются — дубли, не-строки, неизвестные ключи и пустые списки убираются, deny важнее allow", async () => {
    const [me, x, y] = await registerUsers(server().baseUrl, 3);
    const current = (await me.api.get("/api/settings")).body.settings.privacy;
    const res = expectOk(
      await me.api.patch("/api/settings", {
        privacy: {
          ...current,
          exceptions: {
            phone: { allow: [x.id, x.id, 5, "", y.id], deny: [y.id] },
            bio: { allow: [], deny: [] },
            calls: { deny: [x.id] },
            bogus: { allow: [x.id] },
          },
        },
      }),
      settingsPatchBody
    );
    expect(res.settings.privacy.exceptions).toEqual({ phone: { allow: [x.id], deny: [y.id] }, calls: { allow: [], deny: [x.id] } });

    // Без exceptions — ключ пропадает совсем.
    const { exceptions: _drop, ...noExceptions } = current;
    const cleared = expectOk(await me.api.patch("/api/settings", { privacy: noExceptions }), settingsPatchBody).settings.privacy;
    expect(cleared).not.toHaveProperty("exceptions");
  });

  test("privacy заменяется целиком: отсутствующий уровень считается «everyone», а не значением по умолчанию", async () => {
    const [me, stranger] = await registerUsers(server().baseUrl, 2);
    // По умолчанию телефон виден только контактам.
    expect((await stranger.api.get(`/api/users/${me.id}`)).body.user).not.toHaveProperty("phone");
    // Неполный privacy не проходит строгую схему — сервер его не дополняет.
    const res = await me.api.patch("/api/settings", { privacy: { lastSeen: "nobody" } });
    expect(res.status).toBe(200);
    expect(res.body.settings.privacy).toEqual({ lastSeen: "nobody" });
    // ПОВЕДЕНИЕ-ВОПРОС: lib/privacyRules.js для отсутствующего ключа берёт «everyone», а DEFAULT_SETTINGS
    // держит phone = contacts — неполный объект privacy открывает телефон всем.
    expect((await stranger.api.get(`/api/users/${me.id}`)).body.user.phone).toBe(me.phone);

    // privacy не объектом сохраняется как есть.
    const raw = await me.api.patch("/api/settings", { privacy: "x" });
    expect(raw.status).toBe(200);
    expect(raw.body.settings.privacy).toBe("x");
  });

  test("appIcon: только [a-z0-9-]{1,32}; некорректный молча отбрасывается, прежний сохраняется", async () => {
    const me = await registerUser(server().baseUrl);
    expect(expectOk(await me.api.patch("/api/settings", { appIcon: "dark-2" }), settingsPatchBody).settings.appIcon).toBe("dark-2");
    for (const bad of ["Dark", "a b", "x".repeat(33), 5, null]) {
      const res = expectOk(await me.api.patch("/api/settings", { appIcon: bad, theme: "light" }), settingsPatchBody);
      expect(res.settings.appIcon).toBe("dark-2");
      expect(res.settings.theme).toBe("light");
    }
  });

  test("holidays: отключённые без дублей и не-строк; свои — с проверкой даты и названия, id выдаётся", async () => {
    const me = await registerUser(server().baseUrl);
    const res = expectOk(
      await me.api.patch("/api/settings", {
        holidays: {
          disabled: ["shalter_day", "shalter_day", 5],
          custom: [
            { date: "03-08", title: "  Весна  " },
            { id: "mine", date: "12-31", title: "Н".repeat(100) },
            { date: "13-01", title: "месяц 13" },
            { date: "01-32", title: "день 32" },
            { date: "1-1", title: "формат" },
            { date: "01-01", title: "   " },
            null,
          ],
        },
      }),
      settingsPatchBody
    );
    const { disabled, custom } = res.settings.holidays;
    expect(disabled).toEqual(["shalter_day"]);
    expect(custom).toEqual([
      { id: expect.stringMatching(/^hol_[a-z0-9]+_[a-z0-9]+$/), title: "Весна", date: "03-08" },
      { id: "mine", title: "Н".repeat(80), date: "12-31" },
    ]);
    // ПОВЕДЕНИЕ-ВОПРОС: день проверяется только на 1..31 без учёта месяца — «02-30» принимается.
    const odd = expectOk(await me.api.patch("/api/settings", { holidays: { custom: [{ date: "02-30", title: "x" }] } }), settingsPatchBody);
    expect(odd.settings.holidays).toEqual({ disabled: [], custom: [{ id: expect.any(String), title: "x", date: "02-30" }] });
  });

  test("business: без бизнес-подписки enabled = false; часы, пояс, ответы — нормализуются", async () => {
    const me = await registerUser(server().baseUrl);
    const att = { kind: "image", url: await uploadedUrl(me) };
    const res = expectOk(
      await me.api.patch("/api/settings", {
        business: {
          enabled: true,
          timeZone: "Mars/Olympus",
          showHours: false,
          hours: { mon: { closed: 1, open: "25:00", close: "24:00" }, tue: { open: "08:30", close: "17:45" } },
          greeting: { enabled: 1, text: "  привет  ", attachments: [att, { kind: "file", url: await uploadedUrl(me) }] },
          away: { text: "я".repeat(600), attachments: [{ kind: "bogus" }] },
          quickReplies: [{ shortcut: "  hi  ", text: "  Здравствуйте  " }, { text: "" }, { id: "q1", text: "", attachments: [att] }, null],
        },
      }),
      settingsPatchBody
    );
    const b = res.settings.business;
    expect(b.enabled).toBe(false);
    expect(b.timeZone).toBeNull();
    expect(b.showHours).toBe(false);
    expect(b.hours.mon).toEqual({ closed: true, open: "09:00", close: "24:00" });
    expect(b.hours.tue).toEqual({ closed: false, open: "08:30", close: "17:45" });
    // ПОВЕДЕНИЕ-ВОПРОС: дни, которых нет в PATCH, становятся рабочими 09–18 — включая сб и вс,
    // хотя по умолчанию (DEFAULT_SETTINGS) выходные закрыты.
    expect(b.hours.sat).toEqual(DEFAULT_HOURS);
    expect(b.greeting).toEqual({ enabled: true, text: "привет", attachments: [att] });
    expect(b.away).toEqual({ enabled: false, text: "я".repeat(500), attachments: [] });
    expect(b.quickReplies).toEqual([
      { id: expect.stringMatching(/^qr_[a-z0-9]+_[a-z0-9]+$/), shortcut: "hi", text: "Здравствуйте", attachments: [] },
      { id: "q1", shortcut: "", text: "", attachments: [att] },
    ]);

    // Корректный пояс сохраняется; business заменяется целиком.
    const tz = expectOk(await me.api.patch("/api/settings", { business: { timeZone: "Europe/Moscow" } }), settingsPatchBody).settings.business;
    expect(tz.timeZone).toBe("Europe/Moscow");
    expect(tz.greeting).toEqual({ enabled: false, text: "", attachments: [] });
    expect(tz.showHours).toBe(true);
  });

  test("чужая неприкреплённая загрузка в обоях или автоответе — 400, настройки не меняются; свои прежние — сохраняются повторно", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const mine = await uploadedUrl(me);
    const saved = expectOk(await me.api.patch("/api/settings", { chatWallpaperImage: mine }), settingsPatchBody).settings;
    expect(saved.chatWallpaperImage).toBe(mine);
    const theirs = await uploadedUrl(other);
    for (const patch of [
      { chatWallpaperImage: theirs },
      { chatWallpaperImage: fakeUploadUrl() },
      { business: { greeting: { enabled: true, text: "x", attachments: [{ kind: "image", url: theirs }] } } },
    ]) {
      expectError(await me.api.patch("/api/settings", patch), 400, "Некорректная ссылка на файл");
    }
    expect(expectOk(await me.api.get("/api/settings"), settingsGetBody).settings.chatWallpaperImage).toBe(mine);
    expect((await download(me.api, theirs)).status).toBe(404);
    expect(expectOk(await me.api.patch("/api/settings", { chatWallpaperImage: mine, theme: "dark" }), settingsPatchBody).settings.chatWallpaperImage).toBe(mine);
  });

  test("украинский язык интерфейса и перевода — 400, настройки не меняются", async () => {
    const me = await registerUser(server().baseUrl);
    const text = "Украинский язык не поддерживается в нашем мессенджере";
    for (const patch of [{ uiLanguage: "uk" }, { uiLanguage: "uk-UA" }, { translateLanguage: "UK" }, { translateLanguage: "uk_UA", theme: "dark" }]) {
      expectError(await me.api.patch("/api/settings", patch), 400, text);
    }
    const s = (await me.api.get("/api/settings")).body.settings;
    expect(s).toMatchObject({ uiLanguage: "ru", translateLanguage: "ru", theme: "system" });
    expect(expectOk(await me.api.patch("/api/settings", { uiLanguage: "en", translateLanguage: "de" }), settingsPatchBody).settings).toMatchObject({ uiLanguage: "en", translateLanguage: "de" });
  });

  test("изменения на другие устройства по WS не рассылаются — видны при следующем GET", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const other = await login(baseUrl, me);
    const ws = await open(other);
    await me.api.patch("/api/settings", { theme: "dark" });
    await ws.expectNone("settings:updated", () => true, 500);
    expect(ws.events.filter((e) => e.type !== "presence:update")).toEqual([]);
    expect((await other.get("/api/settings")).body.settings.theme).toBe("dark");
  });
});

describe("GET /api/settings/storage", () => {
  test("байты вложений по корзинам во всех своих чатах; size или длина data-URL", async () => {
    const { baseUrl } = server();
    const [me, peer, outsider] = await registerUsers(baseUrl, 3);
    expect(expectOk(await me.api.get("/api/settings/storage"), storageBody)).toEqual({ bytesByBucket: { photos: 0, videos: 0, files: 0, voice: 0 } });

    const dm = await createDm(me, peer);
    const group = await createGroup(peer, [me]);
    await sendText(me, dm.id, "", {
      attachments: [
        { kind: "image", url: "data:image/png;base64,AAAA", size: 1000 },
        { kind: "file", url: "data:text/plain;base64,AAAA", name: "a.txt", size: 50 },
        // Без size — по длине base64: 8 символов → 6 байт.
        { kind: "video", url: "data:video/mp4;base64,AAAAAAAA" },
      ],
    });
    await sendText(peer, group.id, "", {
      attachments: [
        { kind: "video-note", url: "data:video/mp4;base64,AAAA", size: 4 },
        { kind: "voice", url: "data:audio/ogg;base64,AAAA", size: 7 },
        { kind: "location", meta: { lat: 1, lng: 2 } },
      ],
    });
    await sendText(outsider, (await createDm(outsider, peer)).id, "", { attachments: [{ kind: "image", url: "data:image/png;base64,AAAA", size: 999 }] });

    expect(expectOk(await me.api.get("/api/settings/storage"), storageBody).bytesByBucket).toEqual({ photos: 1000, videos: 10, files: 50, voice: 7 });
    // Считаются все вложения чатов, а не только свои: у собеседника — то же плюс его третий чат.
    expect((await peer.api.get("/api/settings/storage")).body.bytesByBucket).toEqual({ photos: 1999, videos: 10, files: 50, voice: 7 });
  });
});
