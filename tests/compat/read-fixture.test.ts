// Совместимость данных: сервер поднимается на копии tests/compat/fixture/ —
// базе и зашифрованных файлах, которые записал прежний сервер (см. README.md),
// — и через публичный API должен отдать всё ровно так, как оно было записано:
// тексты под разными ключами после ротаций, правки, реакции, опросы, секретный
// чат, файлы байт-в-байт. Потом в ту же базу пишется новое и всё переживает
// перезапуск.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { message as messageSchema } from "../schemas/message";
import type { Api } from "../support/client";
import { expectShape } from "../support/expect";
import { startServer, type TestServer } from "../support/server";
import {
  FIXTURE_DIR,
  MANIFEST_PATH,
  check,
  download,
  listMessages,
  loginOnDevice,
  makePng,
  sha256,
  snapshotChat,
  snapshotMessage,
  upload,
  type Manifest,
  type MessageSnapshot,
  type UserKey,
} from "./helpers";

const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const KEYS: UserKey[] = ["alice", "bob", "carol"];
const userOf = (k: UserKey) => manifest.users.find((u) => u.key === k)!;
const chatId = (name: string) => manifest.chats[name].id;

// Каталог данных нужен свой — против внешнего сервера (TEST_BASE_URL) не запускаем.
describe.skipIf(!!process.env.TEST_BASE_URL)("совместимость: чтение старой базы и файлов", () => {
  let server: TestServer;
  const api = {} as Record<UserKey, Api>;
  // Что должно лежать в каждом чате: снимок из манифеста + то, что тест допишет сам.
  const expected = new Map<string, MessageSnapshot[]>(
    Object.entries(manifest.snapshot.chatMessages).map(([id, v]) => [id, structuredClone(v.messages)]),
  );
  const upsert = (m: any) => {
    const list = expected.get(m.chatId)!;
    const snap = snapshotMessage(m);
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = snap;
    else list.push(snap);
  };
  const newFiles: Array<{ url: string; sha256: string; viewer: UserKey }> = [];

  async function loginAll() {
    for (const k of KEYS) {
      const { api: a, self } = await loginOnDevice(server.baseUrl, userOf(k));
      expect(self.id).toBe(userOf(k).id);
      api[k] = a;
    }
  }

  async function expectChatsMatch() {
    for (const [id, msgs] of expected) {
      const viewer = manifest.snapshot.chatMessages[id].viewer;
      const got = await listMessages(api[viewer], id);
      for (const m of got) expectShape(messageSchema, m, `сообщение ${m.id}`);
      expect(got.map(snapshotMessage), `чат ${id}`).toEqual(msgs);
    }
  }

  async function expectFilesMatch() {
    for (const f of [...manifest.files, ...newFiles]) {
      const res = await download(api[f.viewer], f.url);
      expect(res.status, f.url).toBe(200);
      expect(sha256(res.bytes), f.url).toBe(f.sha256);
    }
  }

  beforeAll(async () => {
    server = await startServer({ seedDataDir: FIXTURE_DIR });
  });
  afterAll(async () => {
    await server?.stop();
  });

  test("фикстура покрывает несколько ротаций ключей", () => {
    expect(manifest.crypto.messageTextKeyIds.length).toBeGreaterThanOrEqual(3);
    expect(manifest.crypto.fileKeyIds.length).toBeGreaterThanOrEqual(2);
    expect(manifest.crypto.secretChatKeys).toBe(1);
  });

  test("каждый пользователь входит своим паролем, секретный чат — со своего устройства", async () => {
    await loginAll();
    for (const k of KEYS) {
      const list = check(await api[k].get("/api/chats"), "список чатов").chats;
      expect(list.map(snapshotChat).sort((a: any, b: any) => a.id.localeCompare(b.id)), k).toEqual(manifest.snapshot.chatLists[k]);
    }
    // С другого устройства секретного чата как будто нет.
    const { api: other } = await loginOnDevice(server.baseUrl, { ...userOf("alice"), deviceId: "f".repeat(24) });
    expect((await other.get(`/api/chats/${chatId("secret")}/messages`)).status).toBe(404);
  });

  test("все сообщения всех чатов совпадают со снимком", async () => {
    await expectChatsMatch();
  });

  test("тексты, правки, ответы, реакции и опрос именованных сообщений", async () => {
    const byChat = new Map<string, any[]>();
    for (const [key, m] of Object.entries(manifest.messages)) {
      const id = chatId(m.chat);
      if (!byChat.has(id)) byChat.set(id, await listMessages(api[m.sender], id));
      const got = byChat.get(id)!.find((x) => x.id === m.id);
      expect(got, key).toBeTruthy();
      expect(got.text, key).toBe(m.text);
      expect(got.senderId, key).toBe(userOf(m.sender).id);
      if (m.originalText) expect(got.editedAt, `${key}: editedAt`).toEqual(expect.any(String));
      else expect(got.editedAt, `${key}: editedAt`).toBeUndefined();
      expect(got.replyToId, key).toBe(m.replyTo ? manifest.messages[m.replyTo].id : null);
      const reactions = (got.reactions ?? []).map((r: any) => ({ emoji: r.emoji, users: r.userIds.map((id: string) => manifest.users.find((u) => u.id === id)?.key) }));
      expect(reactions, `${key}: реакции`).toEqual(m.reactions ?? []);
      if (m.poll) {
        const meta = got.attachments.find((a: any) => a.kind === "poll").meta;
        expect(meta.options).toEqual(m.poll.options);
        expect(meta.votes).toEqual(m.poll.votes);
        expect(meta.voterIds.map((ids: string[]) => [...ids].sort())).toEqual(m.poll.voters.map((ks) => ks.map((k) => userOf(k).id).sort()));
      }
      for (const url of m.files ?? []) expect(JSON.stringify(got.attachments), key).toContain(url);
    }
    // Расшифровка голосового в базе зашифрована отдельно от текста.
    const voice = (await listMessages(api.bob, chatId("dm"))).find((x) => x.id === manifest.messages.dmVoice.id);
    expect(voice.attachments[0].transcript).toBe("Расшифровка голосового — тоже шифруется 🎙️");
  });

  test("поиск по старому индексу находит те же сообщения", async () => {
    for (const s of manifest.searches) {
      const res = check(await api[s.viewer].get(`/api/chats/${chatId(s.chat)}/messages/search`, { query: { q: s.q } }), `поиск ${s.q}`);
      expect(res.messages.map((m: any) => m.id), s.q).toEqual(s.expectIds);
    }
  });

  test("файлы скачиваются байт-в-байт; несжатые — и по Range", async () => {
    await expectFilesMatch();
    for (const f of manifest.files) {
      const head = await download(api[f.viewer], f.url);
      expect(head.headers.get("accept-ranges"), f.url).toBe(f.compressed ? "none" : "bytes");
      if (f.compressed || f.size < 200) continue;
      // Смещение не кратно 16: проверяет пересчёт счётчика AES-CTR с середины блока.
      const start = 37;
      const end = Math.min(f.size - 1, 70_017);
      const part = await download(api[f.viewer], f.url, { range: `bytes=${start}-${end}` });
      expect(part.status, f.url).toBe(206);
      const full = await download(api[f.viewer], f.url);
      expect(sha256(part.bytes), f.url).toBe(sha256(full.bytes.subarray(start, end + 1)));
    }
  });

  test("доступ к файлам по-прежнему ограничен участниками чата", async () => {
    const guarded = manifest.files.filter((f) => f.outsider);
    expect(guarded.length).toBeGreaterThan(0);
    for (const f of guarded) expect((await download(api[f.outsider!], f.url)).status, f.url).toBe(404);
    expect(manifest.dedup.second).toBe(manifest.dedup.first);
  });

  test("в старую базу пишутся новые сообщения, правки, реакции и файлы", async () => {
    const send = async (k: UserKey, chat: string, body: Record<string, unknown>) => {
      const m = check(await api[k].post(`/api/chats/${chatId(chat)}/messages`, body), `сообщение в ${chat}`).message;
      upsert(m);
      return m;
    };
    await send("alice", "dm", { text: "Новое сообщение в старой базе 🆕", replyToId: manifest.messages.dmUnicode.id });
    await send("bob", "secret", { text: "Новое секретное после переезда 🔒" });
    const png = makePng(20, 10);
    const up = check(await upload(api.carol, png, { kind: "file", name: "новый.png", mimeType: "image/png" }), "загрузка");
    await send("carol", "group", { text: "Новый файл", attachments: [{ kind: "file", url: up.url, name: "новый.png", size: up.size }] });
    newFiles.push({ url: up.url, sha256: sha256(png), viewer: "alice" });

    // Правка старого сообщения перешифровывает его текущим ключом.
    const edited = check(
      await api.alice.patch(`/api/chats/${chatId("dm")}/messages/${manifest.messages.dmHello.id}`, { text: "Привет, Боб! 👋 (правка после переезда)" }),
      "правка",
    ).message;
    upsert(edited);
    const reacted = check(await api.carol.post(`/api/chats/${chatId("group")}/messages/${manifest.messages.groupThird.id}/react`, { emoji: "👏" }), "реакция").message;
    upsert(reacted);

    await expectChatsMatch();
    await expectFilesMatch();
    const found = check(await api.bob.get(`/api/chats/${chatId("dm")}/messages/search`, { query: { q: "переезда" } }), "поиск").messages;
    expect(found.map((m: any) => m.id).sort()).toContain(manifest.messages.dmHello.id);
  });

  test("после перезапуска старые и новые данные на месте", async () => {
    // Останавливаем, не удаляя каталог, и поднимаем новый сервер на копии того же data/.
    const oldRoot = path.dirname(server.dataDir!);
    await server.stop({ keepData: true });
    server = await startServer({ seedDataDir: path.join(oldRoot, "data") });
    fs.rmSync(oldRoot, { recursive: true, force: true });

    await loginAll();
    await expectChatsMatch();
    await expectFilesMatch();
  });
});
