// Профиль: часы работы бизнеса и полка подарков в GET /api/users/:id, чужие файлы
// в PATCH /api/users/:id (server/routes/users.js).
import { describe, expect, test } from "vitest";
import { expectError, expectOk } from "../../support/expect";
import { registerUsers, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { grantStars, registerAdmin } from "../stars/helpers";
import { addContact } from "../ws/helpers";
import { patchMe, uploadedUrl } from "./helpers";

const ADMIN_PHONE = "+70000000772";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });

let adminPromise: Promise<TestUser> | undefined;
const getAdmin = () => (adminPromise ??= registerAdmin(server().baseUrl, ADMIN_PHONE));

// Круглые сутки каждый день — статус «открыто до 24:00» в любой момент теста.
const ALWAYS_OPEN = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { closed: false, open: "00:00", close: "24:00" }])
);

async function setBusiness(user: TestUser, business: Record<string, unknown>): Promise<void> {
  const res = await user.api.patch("/api/settings", { business });
  expect(res.status, res.text).toBe(200);
}

const profileOf = async (viewer: TestUser, user: TestUser) => (await viewer.api.get(`/api/users/${user.id}`)).body;

describe("GET /api/users/:id — часы работы бизнеса", () => {
  test("у бизнеса с включёнными часами — расписание, пояс и статус; showHours: false — без них", async () => {
    const admin = await getAdmin();
    const [owner, viewer] = await registerUsers(server().baseUrl, 2);
    expect((await admin.api.post("/api/business/grant", { userId: owner.id })).status).toBe(200);
    await setBusiness(owner, { enabled: true, hours: ALWAYS_OPEN, timeZone: "Europe/Moscow" });

    const body = await profileOf(viewer, owner);
    expect(body.user.businessHours).toEqual({ hours: ALWAYS_OPEN, timeZone: "Europe/Moscow", status: { open: true, until: "24:00" } });
    // Себе — так же.
    expect((await profileOf(owner, owner)).user.businessHours.status).toEqual({ open: true, until: "24:00" });

    await setBusiness(owner, { enabled: true, hours: ALWAYS_OPEN, timeZone: "Europe/Moscow", showHours: false });
    expect((await profileOf(viewer, owner)).user).not.toHaveProperty("businessHours");
    await setBusiness(owner, { enabled: false, hours: ALWAYS_OPEN, timeZone: "Europe/Moscow" });
    expect((await profileOf(viewer, owner)).user).not.toHaveProperty("businessHours");
  });

  test("без тарифа бизнеса часов нет, даже если они включены в настройках", async () => {
    const [owner, viewer] = await registerUsers(server().baseUrl, 2);
    await setBusiness(owner, { enabled: true, hours: ALWAYS_OPEN });
    expect((await profileOf(viewer, owner)).user).not.toHaveProperty("businessHours");
  });

  test("пояс не задан — timeZone: null", async () => {
    const admin = await getAdmin();
    const [owner, viewer] = await registerUsers(server().baseUrl, 2);
    await admin.api.post("/api/business/grant", { userId: owner.id });
    await setBusiness(owner, { enabled: true, hours: ALWAYS_OPEN });
    expect((await profileOf(viewer, owner)).user.businessHours).toMatchObject({ timeZone: null, status: { open: true } });
  });
});

describe("GET /api/users/:id — полка подарков", () => {
  test("имя отправителя — текущее и глазами смотрящего (как он записан в контактах)", async () => {
    const admin = await getAdmin();
    const [sender, recipient, stranger, friend] = await registerUsers(server().baseUrl, 4);
    await grantStars(admin, sender, 250);
    expect((await sender.api.post("/api/gifts/buy", { giftId: "cake", recipientId: recipient.id })).status).toBe(200);
    await patchMe(sender, { name: "Новое имя" });
    await addContact(friend, sender, { localName: "Друг" });

    const seenByStranger = (await profileOf(stranger, recipient)).user.giftsReceived.at(-1);
    expect(seenByStranger).toMatchObject({ fromId: sender.id, fromName: "Новое имя", fromAvatarImage: null });
    expect((await profileOf(friend, recipient)).user.giftsReceived.at(-1)).toMatchObject({ fromId: sender.id, fromName: "Друг" });
  });
});

describe("PATCH /api/users/:id — ссылки на загруженные файлы", () => {
  test("чужой файл в любом поле — 400 и ничего не сохраняется; свой — можно", async () => {
    const [me, other] = await registerUsers(server().baseUrl, 2);
    const foreign = await uploadedUrl(other);
    expectError(await me.api.patch(`/api/users/${me.id}`, { bio: `смотри ${foreign}`, lastName: "Петров" }), 400, "Некорректная ссылка на файл");
    const after = (await profileOf(me, me)).user;
    expect(after.bio ?? "").toBe("");
    expect(after.lastName ?? null).toBeNull();

    const own = await uploadedUrl(me);
    expect((await patchMe(me, { bio: `смотри ${own}` })).bio).toBe(`смотри ${own}`);
  });
});
