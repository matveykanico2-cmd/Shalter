// presence:update — «в сети»/«был(а)» при открытии первого и закрытии последнего
// сокета, с фильтрацией по приватности lastSeen и блокировкам (server/ws.js
// broadcastPresence). Событие рассылается всем подключённым, кому разрешено, —
// поэтому проверки всегда фильтруют по userId.
import { describe, expect, test } from "vitest";
import { expectShape } from "../../support/expect";
import { login, registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { presenceUpdate } from "../../schemas/ws";
import { addContact, block, setPrivacy, socketPool } from "./helpers";

const server = useServer();
const open = socketPool();

const presenceOf = (userId: string, online: boolean) => (e: any) => e.userId === userId && e.online === online;

describe("presence:update", () => {
  test("первый сокет — online для всех подключённых и для себя; закрытие последнего — offline", async () => {
    const { baseUrl } = server();
    const viewer = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const viewerWs = await open(viewer.api);

    const bWs = await open(b.api);
    const online = expectShape(presenceUpdate, await viewerWs.waitFor("presence:update", presenceOf(b.id, true)), "presence online");
    // Регистрация проставляет lastSeen — при входе он отдаётся как есть.
    expect(online.lastSeen).toEqual(expect.any(String));
    // Своё «в сети» приходит и на собственный сокет.
    await bWs.waitFor("presence:update", presenceOf(b.id, true));

    const before = Date.now();
    await bWs.close();
    const offline = expectShape(presenceUpdate, await viewerWs.waitFor("presence:update", presenceOf(b.id, false)), "presence offline");
    expect(Date.parse(offline.lastSeen!)).toBeGreaterThanOrEqual(before - 1000);

    // Состояние видно и через API.
    const profile = await viewer.api.get(`/api/users/${b.id}`);
    expect(profile.body.user).toMatchObject({ id: b.id, online: false, lastSeen: offline.lastSeen });
  });

  test("второй сокет не шлёт повторный online, закрытие одного из двух — не offline", async () => {
    const { baseUrl } = server();
    const viewer = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const viewerWs = await open(viewer.api);

    const first = await open(b.api);
    await viewerWs.waitFor("presence:update", presenceOf(b.id, true));
    viewerWs.clear();
    const second = await open(await login(baseUrl, b));
    await viewerWs.expectNone("presence:update", (e) => e.userId === b.id, 300);

    await first.close();
    await viewerWs.expectNone("presence:update", (e) => e.userId === b.id, 300);
    expect((await viewer.api.get(`/api/users/${b.id}`)).body.user.online).toBe(true);

    await second.close();
    await viewerWs.waitFor("presence:update", presenceOf(b.id, false));
  });

  test("lastSeen = nobody — никто, кроме самого пользователя, не получает presence", async () => {
    const { baseUrl } = server();
    const viewer = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    await setPrivacy(b, { lastSeen: "nobody" });
    await addContact(b, viewer); // даже контакт не видит
    const viewerWs = await open(viewer.api);

    const bWs = await open(b.api);
    await bWs.waitFor("presence:update", presenceOf(b.id, true));
    await viewerWs.expectNone("presence:update", (e) => e.userId === b.id, 300);
    await bWs.close();
    await viewerWs.expectNone("presence:update", (e) => e.userId === b.id, 300);
  });

  test("lastSeen = nobody с исключением allow — исключению presence приходит", async () => {
    const { baseUrl } = server();
    const allowed = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    await setPrivacy(b, { lastSeen: "nobody", exceptions: { lastSeen: { allow: [allowed.id], deny: [] } } });
    const allowedWs = await open(allowed.api);
    const otherWs = await open(other.api);

    await open(b.api);
    await allowedWs.waitFor("presence:update", presenceOf(b.id, true));
    await otherWs.expectNone("presence:update", (e) => e.userId === b.id, 300);
  });

  test("lastSeen = contacts — получают только те, кто у пользователя в контактах", async () => {
    const { baseUrl } = server();
    const contact = await registerUser(baseUrl);
    const stranger = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    await setPrivacy(b, { lastSeen: "contacts" });
    await addContact(b, contact);
    // Обратное направление не считается: stranger добавил b, но b его — нет.
    await addContact(stranger, b);
    const contactWs = await open(contact.api);
    const strangerWs = await open(stranger.api);

    const bWs = await open(b.api);
    await contactWs.waitFor("presence:update", presenceOf(b.id, true));
    await strangerWs.expectNone("presence:update", (e) => e.userId === b.id, 300);
    await bWs.close();
    await contactWs.waitFor("presence:update", presenceOf(b.id, false));
    await strangerWs.expectNone("presence:update", (e) => e.userId === b.id, 200);
  });

  test("заблокированный пользователь не получает presence заблокировавшего", async () => {
    const { baseUrl } = server();
    const blockedOne = await registerUser(baseUrl);
    const viewer = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    await block(b, blockedOne);
    const blockedWs = await open(blockedOne.api);
    const viewerWs = await open(viewer.api);

    const bWs = await open(b.api);
    await viewerWs.waitFor("presence:update", presenceOf(b.id, true));
    await blockedWs.expectNone("presence:update", (e) => e.userId === b.id, 300);
    await bWs.close();
    await viewerWs.waitFor("presence:update", presenceOf(b.id, false));
    await blockedWs.expectNone("presence:update", (e) => e.userId === b.id, 200);
  });

  test("тот, кто сам заблокировал, presence заблокированного получает", async () => {
    const { baseUrl } = server();
    const blocker = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    // Фильтруется только список блокировок владельца presence, не зрителя.
    await block(blocker, b);
    const blockerWs = await open(blocker.api);
    await open(b.api);
    await blockerWs.waitFor("presence:update", presenceOf(b.id, true));
  });
});
