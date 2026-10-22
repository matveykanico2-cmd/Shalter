// Контакты: список, id, добавление, заметка, переименование, удаление, поиск по
// номерам телефона (server/routes/contacts.js) и влияние контактов на видимость
// полей профиля (GET /api/users/:id) и contact:updated.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { addedContact, contact, contactListItem, matchResult } from "../../schemas/contacts";
import { contactUpdated } from "../../schemas/ws";
import { addContact, block, setPrivacy, socketPool } from "../ws/helpers";

const server = useServer();
const open = socketPool();
const listBody = z.strictObject({ contacts: z.array(contactListItem) });
const idsBody = z.strictObject({ ids: z.array(z.string()) });

describe("без сессии", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/contacts"],
    ["GET", "/api/contacts/ids"],
    ["POST", "/api/contacts"],
    ["POST", "/api/contacts/note"],
    ["POST", "/api/contacts/rename"],
    ["DELETE", "/api/contacts"],
    ["POST", "/api/contacts/match"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("добавление и список", () => {
  test("POST → новый контакт без note; GET — с note и профилем; /ids — id", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    expect(expectOk(await a.api.get("/api/contacts"), listBody)).toEqual({ contacts: [] });

    const before = Date.now();
    const res = expectOk(await a.api.post("/api/contacts", { userId: b.id, localName: "  Боб с работы  " }), z.strictObject({ contact: addedContact }));
    expect(res.contact).toEqual({ id: expect.any(String), ownerId: a.id, userId: b.id, addedAt: expect.any(String), localName: "Боб с работы" });
    expect(Date.parse(res.contact.addedAt)).toBeGreaterThanOrEqual(before - 1000);

    const list = expectOk(await a.api.get("/api/contacts"), listBody).contacts;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ...res.contact, note: null });
    // Имя для контакта подменяет имя профиля; профильное — в profileName.
    expect(list[0].user).toMatchObject({ id: b.id, name: "Боб с работы", profileName: b.name, inContacts: true });
    expect(list[0].user).not.toHaveProperty("mutualContact");
    // Телефон b по умолчанию виден только его контактам — a у b не в контактах.
    expect(list[0].user).not.toHaveProperty("phone");

    expect(expectOk(await a.api.get("/api/contacts/ids"), idsBody)).toEqual({ ids: [b.id] });
    // У b список пуст — контакт односторонний.
    expect((await b.api.get("/api/contacts/ids")).body).toEqual({ ids: [] });
  });

  test("взаимный контакт: mutualContact и телефон (phone = contacts)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await addContact(a, b);
    await addContact(b, a);
    const item = expectOk(await a.api.get("/api/contacts"), listBody).contacts[0];
    expect(item.user).toMatchObject({ id: b.id, name: b.name, inContacts: true, mutualContact: true, phone: b.phone });
    // localName не задан — profileName нет.
    expect(item.localName).toBeNull();
    expect(item.user).not.toHaveProperty("profileName");
  });

  test("заблокировавший вас контакт номер не показывает, даже с phone = everyone", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await setPrivacy(b, { phone: "everyone" });
    await addContact(a, b);
    expect(expectOk(await a.api.get("/api/contacts"), listBody).contacts[0].user.phone).toBe(b.phone);
    await block(b, a);
    expect(expectOk(await a.api.get("/api/contacts"), listBody).contacts[0].user).not.toHaveProperty("phone");
  });

  test("повторное добавление: localName обновляется, без localName — сохраняется, контакт один", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const first = await addContact(a, b, { localName: "Первое" });
    const again = expectOk(await a.api.post("/api/contacts", { userId: b.id, localName: "Второе" }), z.strictObject({ contact: addedContact })).contact;
    // Повторно отдаётся строка из базы — с ключом note.
    expect(again).toEqual({ ...first, localName: "Второе", note: null });
    const kept = await addContact(a, b);
    expect(kept.localName).toBe("Второе");
    expect((await a.api.get("/api/contacts/ids")).body.ids).toEqual([b.id]);
    // Имя обрезается до 80 символов.
    expect((await addContact(a, b, { localName: "я".repeat(100) })).localName).toBe("я".repeat(80));
  });

  test("ошибки: без userId и сам себя — 400, несуществующий — 404", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expectError(await a.api.post("/api/contacts", {}), 400, "Некорректный контакт");
    expectError(await a.api.post("/api/contacts", { userId: a.id }), 400, "Некорректный контакт");
    expectError(await a.api.post("/api/contacts", { userId: "u_nonexistent00" }), 404, "Пользователь не найден");
  });

  test("sharePhone: контакт видит номер, даже когда phone = nobody", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    await setPrivacy(a, { phone: "nobody" });
    expect((await b.api.get(`/api/users/${a.id}`)).body.user).not.toHaveProperty("phone");

    await addContact(a, b, { sharePhone: true });
    expect((await b.api.get(`/api/users/${a.id}`)).body.user.phone).toBe(a.phone);
    // Исключение записано в настройки приватности a.
    const privacy = (await a.api.get("/api/settings")).body.settings.privacy;
    expect(privacy.exceptions.phone).toEqual({ allow: [b.id], deny: [] });
    // Остальным — по-прежнему нет (даже контакту без sharePhone).
    await addContact(a, c);
    expect((await c.api.get(`/api/users/${a.id}`)).body.user).not.toHaveProperty("phone");
  });
});

describe("контакты и приватность профиля", () => {
  test("GET /api/users/:id: телефон, «был(а)», фото — по уровню contacts смотрят контакты владельца", async () => {
    const { baseUrl } = server();
    const [owner, viewer] = await registerUsers(baseUrl, 2);
    await setPrivacy(owner, { phone: "contacts", lastSeen: "contacts", bio: "contacts" });

    let res = await viewer.api.get(`/api/users/${owner.id}`);
    expect(res.body.user).not.toHaveProperty("phone");
    expect(res.body.user).not.toHaveProperty("lastSeen");
    expect(res.body.user).not.toHaveProperty("bio");
    expect(res.body).toMatchObject({ isContact: false, inContacts: false, contactName: null, contactNote: null });

    // viewer добавил owner — это ничего не открывает: важно, есть ли viewer у owner.
    await addContact(viewer, owner, { localName: "Шеф" });
    res = await viewer.api.get(`/api/users/${owner.id}`);
    expect(res.body.user).not.toHaveProperty("phone");
    expect(res.body).toMatchObject({ isContact: false, inContacts: true, contactName: "Шеф" });
    expect(res.body.user).toMatchObject({ name: "Шеф", profileName: owner.name, inContacts: true });

    await addContact(owner, viewer);
    res = await viewer.api.get(`/api/users/${owner.id}`);
    expect(res.body.user).toMatchObject({ phone: owner.phone, lastSeen: expect.any(String), mutualContact: true });
    expect(res.body.user).toHaveProperty("bio");
    expect(res.body.isContact).toBe(true);
  });

  test("удаление контакта снова скрывает поля", async () => {
    const { baseUrl } = server();
    const [owner, viewer] = await registerUsers(baseUrl, 2);
    await addContact(owner, viewer);
    expect((await viewer.api.get(`/api/users/${owner.id}`)).body.user.phone).toBe(owner.phone);
    expectOk(await owner.api.delete("/api/contacts", { userId: viewer.id }), okBody);
    expect((await viewer.api.get(`/api/users/${owner.id}`)).body.user).not.toHaveProperty("phone");
  });

  test("в GET /api/contacts поля контакта скрыты по его настройкам (фото, bio, lastSeen)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await setPrivacy(b, { photo: "nobody", bio: "nobody", lastSeen: "nobody" });
    await addContact(a, b);
    const user = expectOk(await a.api.get("/api/contacts"), listBody).contacts[0].user;
    expect(user).not.toHaveProperty("avatarImages");
    expect(user).not.toHaveProperty("bio");
    expect(user).not.toHaveProperty("lastSeen");
    expect(user.online).toBe(false);
  });
});

describe("заметка, переименование, удаление", () => {
  test("POST /note: сохраняется, обрезается, пустая — null; видна в списке и профиле", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    expectError(await a.api.post("/api/contacts/note", { userId: b.id, note: "x" }), 404, "Сначала добавьте человека в контакты");
    await addContact(a, b);

    expect(expectOk(await a.api.post("/api/contacts/note", { userId: b.id, note: "  любит чай  " }), z.strictObject({ note: z.string().nullable() }))).toEqual({ note: "любит чай" });
    expect((await a.api.get("/api/contacts")).body.contacts[0].note).toBe("любит чай");
    expect((await a.api.get(`/api/users/${b.id}`)).body.contactNote).toBe("любит чай");
    expect((await a.api.post("/api/contacts/note", { userId: b.id, note: "n".repeat(1200) })).body.note).toHaveLength(1000);
    expect((await a.api.post("/api/contacts/note", { userId: b.id, note: "   " })).body).toEqual({ note: null });
    expect((await a.api.post("/api/contacts/note", { userId: b.id })).body).toEqual({ note: null });
    expect((await a.api.get("/api/contacts")).body.contacts[0].note).toBeNull();
    // Чужая заметка не видна: у b про a ничего нет.
    expect((await b.api.get(`/api/users/${a.id}`)).body.contactNote).toBeNull();
  });

  test("повторное добавление после заметки отдаёт расшифрованную note", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await addContact(a, b);
    await a.api.post("/api/contacts/note", { userId: b.id, note: "секрет" });
    const again = await addContact(a, b);
    expect(again.note).toBe("секрет");
  });

  test("POST /rename: имя для контакта с note; пустое — null; не контакт — 404", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    await addContact(a, b);
    await a.api.post("/api/contacts/note", { userId: b.id, note: "заметка" });
    const renamed = expectOk(await a.api.post("/api/contacts/rename", { userId: b.id, localName: "  Бобби " }), z.strictObject({ contact })).contact;
    expect(renamed).toMatchObject({ ownerId: a.id, userId: b.id, localName: "Бобби", note: "заметка" });
    expect((await a.api.post("/api/contacts/rename", { userId: b.id, localName: "" })).body.contact.localName).toBeNull();
    expect((await a.api.post("/api/contacts/rename", { userId: b.id })).body.contact.localName).toBeNull();
    expectError(await a.api.post("/api/contacts/rename", { userId: c.id, localName: "x" }), 404, "Контакт не найден");
  });

  test("DELETE: удаляет; несуществующий — тоже {ok:true}", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    await addContact(a, b);
    expectOk(await a.api.delete("/api/contacts", { userId: b.id }), okBody);
    expect((await a.api.get("/api/contacts/ids")).body).toEqual({ ids: [] });
    expectOk(await a.api.delete("/api/contacts", { userId: b.id }), okBody);
    expectOk(await a.api.delete("/api/contacts", {}), okBody);
  });
});

describe("POST /api/contacts/match — поиск по номерам", () => {
  test("находит по любому написанию номера, 8… = +7…; дубли и пустые не считаются", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    await addContact(a, c);
    const bDigits = b.phone.slice(2); // без «+7»
    const res = expectOk(
      await a.api.post("/api/contacts/match", {
        contacts: [
          { phone: `8 (${bDigits.slice(0, 3)}) ${bDigits.slice(3, 6)}-${bDigits.slice(6)}`, name: "Боб" },
          { phone: b.phone, name: "Боб дубль" },
          { phone: c.phone, name: "Кэрол" },
          { phone: "+70000000000", name: "Никто" },
          { phone: "", name: "Пусто" },
          { name: "Без номера" },
          null,
          { phone: a.phone, name: "Я сам" },
        ],
      }),
      matchResult
    );
    expect(res.checked).toBe(4);
    expect(res.found).toEqual([
      { user: expect.objectContaining({ id: b.id }), alreadyContact: false, localName: "Боб" },
      { user: expect.objectContaining({ id: c.id }), alreadyContact: true, localName: "Кэрол" },
    ]);
    // Себя не находит и в notFound не кладёт.
    expect(res.notFound).toEqual([{ phone: "+70000000000", name: "Никто" }]);
    // В найденном профиле номера нет.
    expect(res.found[0].user).not.toHaveProperty("phone");
  });

  test("скрываются: discoverByPhone = nobody/contacts, заблокировавшие и заблокированные — попадают в notFound", async () => {
    const { baseUrl } = server();
    const [a, hidden, contactsOnly, friend, blocker, blockedByMe] = await registerUsers(baseUrl, 6);
    await setPrivacy(hidden, { discoverByPhone: "nobody" });
    await setPrivacy(contactsOnly, { discoverByPhone: "contacts" });
    await setPrivacy(friend, { discoverByPhone: "contacts" });
    await addContact(friend, a);
    await block(blocker, a);
    await block(a, blockedByMe);

    const users = [hidden, contactsOnly, friend, blocker, blockedByMe];
    const res = expectOk(await a.api.post("/api/contacts/match", { contacts: users.map((u) => ({ phone: u.phone, name: u.username })) }), matchResult);
    expect(res.found.map((f) => f.user.id)).toEqual([friend.id]);
    expect(res.notFound.map((n) => n.name).sort()).toEqual([hidden, contactsOnly, blocker, blockedByMe].map((u) => u.username).sort());
    expect(res.checked).toBe(5);
  });

  test("не массив — пустой результат; больше 1000 номеров — 413", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expect(expectOk(await a.api.post("/api/contacts/match", { contacts: "нет" }), matchResult)).toEqual({ found: [], notFound: [], checked: 0 });
    expect((await a.api.post("/api/contacts/match", {})).body).toEqual({ found: [], notFound: [], checked: 0 });
    const many = Array.from({ length: 1001 }, (_, i) => ({ phone: `+7900${String(i).padStart(7, "0")}` }));
    expectError(await a.api.post("/api/contacts/match", { contacts: many }), 413, "За один раз можно проверить не больше 1000 номеров");
  });

  test("имя и номер в ответе обрезаются (120 и 40 символов)", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const res = expectOk(await a.api.post("/api/contacts/match", { contacts: [{ phone: "+7 999 " + "0".repeat(50), name: "и".repeat(200) }] }), matchResult);
    expect(res.notFound[0].name).toHaveLength(120);
    expect(res.notFound[0].phone).toHaveLength(40);
  });
});

describe("contact:updated", () => {
  test("смена профиля: себе — publicUser, добавившим в контакты и собеседникам по личке — своя версия; посторонним — ничего", async () => {
    const { baseUrl } = server();
    const [b, owner, dmPeer, outsider] = await registerUsers(baseUrl, 4);
    await addContact(owner, b, { localName: "Бэ" });
    await createDm(dmPeer, b);
    const [bWs, ownerWs, peerWs, outsiderWs] = await Promise.all([open(b.api), open(owner.api), open(dmPeer.api), open(outsider.api)]);

    expect((await b.api.patch(`/api/users/${b.id}`, { name: "Новое имя" })).status).toBe(200);

    const self = expectShape(contactUpdated, await bWs.waitFor("contact:updated", (e) => e.user?.id === b.id), "contact:updated себе");
    expect(self.user).toMatchObject({ id: b.id, name: "Новое имя" });
    const forOwner = expectShape(contactUpdated, await ownerWs.waitFor("contact:updated", (e) => e.user?.id === b.id), "contact:updated владельцу");
    expect(forOwner.user).toMatchObject({ id: b.id, name: "Бэ", profileName: "Новое имя", inContacts: true });
    const forPeer = await peerWs.waitFor("contact:updated", (e) => e.user?.id === b.id);
    expect(forPeer.user).toMatchObject({ id: b.id, name: "Новое имя" });
    expect(forPeer.user).not.toHaveProperty("inContacts");
    await outsiderWs.expectNone("contact:updated", () => true, 300);
  });

  test("добавление/удаление контакта само по себе событий не шлёт", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const [aWs, bWs] = await Promise.all([open(a.api), open(b.api)]);
    await addContact(a, b);
    await a.api.delete("/api/contacts", { userId: b.id });
    await aWs.expectNone("contact:updated", () => true, 300);
    await bWs.expectNone("contact:updated", () => true, 0);
  });
});
