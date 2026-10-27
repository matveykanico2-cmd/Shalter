// Генератор фикстуры совместимости данных: поднимает ТЕКУЩИЙ сервер, через
// публичный API наполняет базу и файлы, гасит сервер и сохраняет его data/ в
// packages/contract-tests/compat/fixture/ вместе с fixture.manifest.json.
//
// Запускается только по требованию:
//   BUILD_COMPAT_FIXTURE=1 npx vitest run --config packages/contract-tests/vitest.config.ts compat/build-fixture
//
// KEY_ROTATION_SECONDS=10 (минимум, который принимает server/lib/keyring.js) и
// паузы между «фазами» дают несколько ротаций ключей: сообщения и файлы в
// фикстуре зашифрованы разными ключами из crypto_keys.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { Api } from "../support/client";
import { TEST_KEYS } from "../support/env";
import { startServer } from "../support/server";
import {
  FIXTURE_DIR,
  MANIFEST_PATH,
  check,
  download,
  listMessages,
  makePng,
  pseudoRandomBytes,
  sha256,
  sleep,
  snapshotChat,
  snapshotMessage,
  upload,
  uploadUrlsOf,
  type Manifest,
  type ManifestFile,
  type ManifestUser,
  type UserKey,
} from "./helpers";

const require = createRequire(import.meta.url);

const ROTATION_SECONDS = 10;
const BUILD = process.env.BUILD_COMPAT_FIXTURE === "1";

const USERS: Array<Omit<ManifestUser, "id" | "deviceId">> = [
  { key: "alice", name: "Алиса Тестова", email: "alice@compat.invalid", password: "alice-pass-1", phone: "+79001110001", username: "compat_alice" },
  { key: "bob", name: "Боб 🐻", email: "bob@compat.invalid", password: "bob-pass-2", phone: "+79001110002", username: "compat_bob" },
  { key: "carol", name: "Кэрол", email: "carol@compat.invalid", password: "carol-pass-3", phone: "+79001110003", username: "compat_carol" },
];

const UNICODE_TEXT =
  "Семья 👨‍👩‍👧‍👦, флаг 🏳️‍🌈, кожа 👍🏽, עברית, العربية, 中文, 日本語, 한국어, " +
  "комбинированные é и й, математика 𝔘𝔫𝔦𝔠𝔬𝔡𝔢 ∑∫√, кавычки «»„“, неразрывный пробел, табуляция\tи\nперенос";

function longText(): string {
  const lines: string[] = [];
  for (let i = 1; lines.join("\n").length < 3900; i++) {
    lines.push(`${i}. Длинное сообщение — строка номер ${i}, с эмодзи 🚀 и латиницей Lorem ipsum dolor sit amet.`);
  }
  return lines.join("\n").slice(0, 4000);
}

test.skipIf(!BUILD)("собрать фикстуру совместимости", { timeout: 180_000 }, async () => {
  const server = await startServer({ env: { KEY_ROTATION_SECONDS: String(ROTATION_SECONDS) } });
  const baseUrl = server.baseUrl;
  const root = path.dirname(server.dataDir!);
  let stopped = false;

  const api: Record<UserKey, Api> = {} as any;
  const users: Record<UserKey, ManifestUser> = {} as any;
  const chats: Manifest["chats"] = {};
  const named: Manifest["messages"] = {};
  const originals = new Map<string, { kind: string; name: string; bytes: Buffer }>();

  const userKeyOf = (id: string) => (Object.values(users).find((u) => u.id === id)?.key ?? id) as UserKey;

  async function send(key: string, sender: UserKey, chat: string, text: string, extra: Record<string, unknown> = {}) {
    const msg = check(await api[sender].post(`/api/chats/${chats[chat].id}/messages`, { text, ...extra }), `сообщение ${key}`).message;
    named[key] = { id: msg.id, chat, sender, text };
    return msg;
  }
  async function react(key: string, user: UserKey, emoji: string) {
    const m = named[key];
    check(await api[user].post(`/api/chats/${chats[m.chat].id}/messages/${m.id}/react`, { emoji }), `реакция ${key}`);
  }
  async function edit(key: string, text: string) {
    const m = named[key];
    const res = check(await api[m.sender].patch(`/api/chats/${chats[m.chat].id}/messages/${m.id}`, { text }), `правка ${key}`);
    m.originalText = m.text;
    m.text = text;
    expect(res.message.editedAt).toBeTruthy();
  }
  async function put(user: UserKey, bytes: Buffer, kind: string, name: string, mimeType: string) {
    const body = check(await upload(api[user], bytes, { kind, name, mimeType }), `загрузка ${name}`);
    if (!originals.has(body.url)) originals.set(body.url, { kind, name, bytes });
    return { kind, url: body.url, name, size: body.size, mimeType };
  }

  try {
    // ── Фаза 1: пользователи, чаты, первые сообщения и файлы (ключ №1) ─────────
    for (const u of USERS) {
      const a = new Api(baseUrl);
      const res = check(await a.post("/api/auth/register-email", { name: u.name, email: u.email, password: u.password, phone: u.phone, username: u.username }), `регистрация ${u.key}`);
      api[u.key] = a;
      users[u.key] = { ...u, id: res.user.id, deviceId: a.cookies.get("device_id")! };
    }
    const { alice, bob, carol } = users;

    const dm = check(await api.alice.post("/api/chats", { userId: bob.id }), "личка").chat;
    chats.dm = { id: dm.id, type: "dm", members: ["alice", "bob"] };
    const group = check(await api.alice.post("/api/chats/groups", { title: "Компания 🎉", memberIds: [bob.id, carol.id] }), "группа").chat;
    chats.group = { id: group.id, type: "group", members: ["alice", "bob", "carol"] };
    const channel = check(await api.alice.post("/api/chats/channels", { title: "Новости «Shalter»", memberIds: [bob.id, carol.id] }), "канал").chat;
    chats.channel = { id: channel.id, type: "channel", members: ["alice", "bob", "carol"] };
    // Обсуждение канала: участники — не все подписчики, а кто вступил (см. снимок ниже).
    chats.discussion = { id: channel.linkedDiscussionChatId, type: "group", members: [] };

    await send("dmHello", "alice", "dm", "Привет, Боб! 👋");
    await send("dmReply", "bob", "dm", "Привет! Как дела? 😊", { replyToId: named.dmHello.id });
    named.dmReply.replyTo = "dmHello";
    await send("dmLong", "alice", "dm", longText());
    await send("dmUnicode", "bob", "dm", UNICODE_TEXT);
    await send("dmToEdit", "alice", "dm", "Это сообщение будет изменено");
    await react("dmHello", "bob", "👍");

    const png = await put("alice", makePng(64, 48), "image", "градиент.png", "image/png");
    await send("dmImage", "alice", "dm", "Картинка 🖼️", { attachments: [png] });
    named.dmImage.files = [png.url];

    const txtBytes = Buffer.from("Текстовый файл 📄\nВторая строка — UTF-8.\n".repeat(40), "utf8");
    const txt = await put("bob", txtBytes, "file", "заметки.txt", "text/plain");
    await send("groupText", "bob", "group", "Файл с заметками", { attachments: [txt] });
    named.groupText.files = [txt.url];

    await send("groupPoll", "alice", "group", "Куда идём в пятницу?", {
      attachments: [{ kind: "poll", meta: { options: ["В кино 🎬", "В парк 🌳", "Сидим дома"] } }],
    });
    for (const [u, i] of [["bob", 0], ["carol", 1], ["alice", 0]] as const) {
      check(await api[u].post(`/api/chats/${group.id}/messages/${named.groupPoll.id}/vote`, { optionIndex: i }), `голос ${u}`);
    }
    named.groupPoll.poll = { options: ["В кино 🎬", "В парк 🌳", "Сидим дома"], votes: [2, 1, 0], voters: [["bob", "alice"], ["carol"], []] };

    await send("groupBobToEdit", "bob", "group", "Опечатка в слвое");
    await react("groupBobToEdit", "carol", "❤️");

    await send("channelPost", "alice", "channel", "Первый пост канала 📣\nс переносом строки");
    await react("channelPost", "bob", "🔥");

    // Секретный чат: создатель привязывает своё устройство, собеседник — открыв чат.
    const secret = check(await api.alice.post("/api/chats/secret", { userId: bob.id }), "секретный чат").chat;
    chats.secret = { id: secret.id, type: "dm", members: ["alice", "bob"] };
    check(await api.bob.get(`/api/chats/${secret.id}`), "собеседник открывает секретный чат");
    await send("secretHello", "alice", "secret", "Секретное сообщение 🤫");

    // ── Фаза 2: после ротации (ключ №2) ───────────────────────────────────────
    await sleep(ROTATION_SECONDS * 1000 + 500);
    await edit("dmToEdit", "Это сообщение изменено ✏️ во второй фазе");
    const bin = await put("carol", pseudoRandomBytes(300 * 1024, 0xc0ffee), "file", "данные.bin", "application/octet-stream");
    await send("groupBinary", "carol", "group", "Бинарник на 300 КБ", { attachments: [bin] });
    named.groupBinary.files = [bin.url];
    await send("secretReply", "bob", "secret", "Ответ в секретном чате 🔐", { replyToId: named.secretHello.id });
    named.secretReply.replyTo = "secretHello";
    // Те же байты второй раз — сервер хранит файл один раз (sha_…), ключ — от первой загрузки.
    const txtAgain = await put("alice", txtBytes, "file", "копия.txt", "text/plain");
    await send("dmTextAgain", "alice", "dm", "Тот же файл ещё раз", { attachments: [txtAgain] });
    named.dmTextAgain.files = [txtAgain.url];
    await react("dmUnicode", "alice", "😂");

    // ── Фаза 3: ещё одна ротация (ключ №3) ────────────────────────────────────
    await sleep(ROTATION_SECONDS * 1000 + 500);
    const zip = await put("bob", pseudoRandomBytes(200 * 1024, 0xbeef), "file", "архив.zip", "application/zip");
    const voice = { ...(await put("bob", pseudoRandomBytes(6000, 0x5eed), "voice", "voice.ogg", "audio/ogg")), durationSec: 3, waveform: [1, 5, 9, 31, 12, 0], transcript: "Расшифровка голосового — тоже шифруется 🎙️" };
    await send("dmVoice", "bob", "dm", "", { attachments: [voice] });
    await send("dmZip", "bob", "dm", "Архив", { attachments: [zip] });
    named.dmVoice.files = [voice.url];
    named.dmZip.files = [zip.url];
    await edit("groupBobToEdit", "Опечатка в слове — исправлено в третьей фазе");
    await send("groupThird", "alice", "group", "Третья фаза 🥉");
    await send("secretThird", "alice", "secret", "Третье секретное");
    // Смена реакции: 👍 → 🎉 (у обычного пользователя одна реакция на сообщение).
    await react("dmHello", "bob", "🎉");

    // Превью картинки сервер строит в фоне — ждём, пока оно появится.
    for (let i = 0; i < 100; i++) {
      const m = (await listMessages(api.alice, dm.id)).find((x) => x.id === named.dmImage.id);
      if (m?.attachments?.[0] && !m.attachments[0].previewPending) break;
      await sleep(100);
    }

    // ── Снимок того, что видит каждый пользователь ────────────────────────────
    const snapshot: Manifest["snapshot"] = { chatLists: {} as any, chatMessages: {} };
    const viewerOf = new Map<string, UserKey>();
    for (const key of ["alice", "bob", "carol"] as UserKey[]) {
      const list = check(await api[key].get("/api/chats"), "список чатов").chats;
      snapshot.chatLists[key] = list.map(snapshotChat).sort((a: any, b: any) => a.id.localeCompare(b.id));
      for (const c of list) {
        if (snapshot.chatMessages[c.id]) continue;
        const msgs = await listMessages(api[key], c.id);
        snapshot.chatMessages[c.id] = { viewer: key, messages: msgs.map(snapshotMessage) };
        for (const m of msgs) for (const url of uploadUrlsOf(m)) if (!viewerOf.has(url)) viewerOf.set(url, key);
      }
    }

    for (const c of Object.values(chats)) {
      c.members = (["alice", "bob", "carol"] as UserKey[]).filter((k) => snapshot.chatLists[k].some((x) => x.id === c.id));
    }

    // Реакции именованных сообщений — как их видит API.
    for (const m of Object.values(named)) {
      const snap = snapshot.chatMessages[chats[m.chat].id].messages.find((x) => x.id === m.id)!;
      if (snap.reactions.length) m.reactions = snap.reactions.map((r: any) => ({ emoji: r.emoji, users: r.userIds.map(userKeyOf) }));
    }

    // Файлы: исходные — sha256 своих байтов, превью — sha256 того, что отдал сервер.
    const files: ManifestFile[] = [];
    for (const [url, viewer] of viewerOf) {
      const res = await download(api[viewer], url);
      expect(res.status, url).toBe(200);
      const orig = originals.get(url);
      if (orig) expect(sha256(res.bytes), url).toBe(sha256(orig.bytes));
      const chatIds = Object.entries(snapshot.chatMessages)
        .filter(([, v]) => v.messages.some((m) => JSON.stringify(m.attachments ?? []).includes(url)))
        .map(([id]) => id);
      const outsider = (["alice", "bob", "carol"] as UserKey[]).find((k) => !snapshot.chatLists[k].some((c) => chatIds.includes(c.id)));
      files.push({
        url,
        origin: orig ? "original" : "generated",
        kind: orig?.kind,
        name: orig?.name,
        size: res.bytes.length,
        sha256: sha256(res.bytes),
        viewer,
        outsider,
        compressed: res.headers.get("accept-ranges") === "none",
        keyId: null,
      });
    }

    // Поиск по старому индексу (токены — HMAC от слов, ключ из MESSAGES_KEY).
    const searches: Manifest["searches"] = [];
    for (const [viewer, chat, q, mustFind] of [
      ["alice", "dm", "дела", "dmReply"],
      ["bob", "dm", "измен", "dmToEdit"],
      ["carol", "group", "пятниц", "groupPoll"],
    ] as const) {
      const found = check(await api[viewer].get(`/api/chats/${chats[chat].id}/messages/search`, { query: { q } }), `поиск ${q}`).messages;
      const ids = found.map((m: any) => m.id);
      expect(ids, `поиск «${q}»`).toContain(named[mustFind].id);
      searches.push({ viewer, chat, q, expectIds: ids });
    }

    // ── Гасим сервер и забираем data/ ─────────────────────────────────────────
    await server.stop({ keepData: true });
    stopped = true;

    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
    fs.cpSync(path.join(root, "data"), FIXTURE_DIR, {
      recursive: true,
      filter: (src) => path.basename(src) !== "outbox",
    });
    fs.rmSync(root, { recursive: true, force: true });

    // Сервер на выходе базу не закрывает — данные могут остаться в -wal.
    // Переносим их в основной файл и закрываем: SQLite сам удалит -wal и -shm.
    // VACUUM нельзя: он перенумеровал бы rowid, а на них держится индекс поиска.
    const Database = require("better-sqlite3");
    const db = new Database(path.join(FIXTURE_DIR, "app.db"));
    db.pragma("wal_checkpoint(TRUNCATE)");
    const keys = db.prepare("SELECT id, purpose, createdAt FROM crypto_keys ORDER BY id").all();
    const textKeyIds = new Set<number>();
    for (const r of db.prepare("SELECT text FROM messages WHERE text LIKE 'enc2:%'").all() as Array<{ text: string }>) {
      textKeyIds.add(Number(r.text.split(":")[1]));
    }
    const secretChatKeys = db.prepare("SELECT count(*) AS n FROM chats WHERE secret = 1 AND secretKey LIKE 'sk1:%'").get().n;
    db.close();
    for (const suffix of ["-wal", "-shm"]) {
      expect(fs.existsSync(path.join(FIXTURE_DIR, `app.db${suffix}`)), `app.db${suffix} остался`).toBe(false);
    }

    // Номер ключа файла — в заголовке SHENC2 (6 байт магии + uint32 BE).
    for (const f of files) {
      const head = fs.readFileSync(path.join(FIXTURE_DIR, "uploads", f.url.slice("/uploads/".length))).subarray(0, 10);
      f.keyId = head.subarray(0, 6).toString() === "SHENC2" ? head.readUInt32BE(6) : null;
    }
    files.sort((a, b) => a.url.localeCompare(b.url));

    const manifest: Manifest = {
      generatedAt: new Date().toISOString(),
      note: "Сгенерировано packages/contract-tests/compat/build-fixture.test.ts — не править вручную, см. packages/contract-tests/compat/README.md",
      env: { MESSAGES_KEY: TEST_KEYS.messages, UPLOADS_KEY: TEST_KEYS.uploads, KEY_ROTATION_SECONDS: String(ROTATION_SECONDS) },
      users: Object.values(users),
      chats,
      messages: named,
      files,
      dedup: { first: txt.url, second: txtAgain.url },
      snapshot,
      crypto: {
        keys,
        messageTextKeyIds: [...textKeyIds].sort((a, b) => a - b),
        fileKeyIds: [...new Set(files.map((f) => f.keyId).filter((k): k is number => k != null))].sort((a, b) => a - b),
        secretChatKeys,
      },
      searches,
    };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

    // Фикстура должна покрывать ротацию, иначе она не проверяет главного.
    expect(manifest.crypto.messageTextKeyIds.length).toBeGreaterThanOrEqual(3);
    expect(manifest.crypto.fileKeyIds.length).toBeGreaterThanOrEqual(2);
    expect(txtAgain.url).toBe(txt.url);
  } finally {
    if (!stopped) await server.stop();
  }
});
