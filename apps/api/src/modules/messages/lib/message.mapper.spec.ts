// MessagesRepository и TopicsRepository обязаны читать и писать то же, что
// server/data/messages.js и server/data/topics.js: пока боты, посты, отложенные и фоновый
// процесс в server/, одни и те же сообщения читают и меняют оба бэкенда. Текст в базе
// зашифрован — шифротекст должен открываться обоими.
//
// Здесь, в отдельном процессе vitest, cwd — временный каталог: server/db.js открывает в нём
// data/app.db, а server/data/*.js и репозитории работают с одним подключением, одними
// ключами (MESSAGES_KEY) и одной ротацией ключей.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../db/db.module.js";
import * as schema from "../../db/schema.js";
import { TopicsRepository } from "../../topics/topics.repository.js";
import { MessagesRepository } from "../messages.repository.js";
import type { Message, NewMessage } from "../model/domain.js";
import * as edits from "./message-edits.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SERVER = path.join(REPO_ROOT, "server");
const ORIGINAL_CWD = process.cwd();

type Legacy = Record<string, (...args: any[]) => any>;
let dir: string;
let conn: BetterSqlite3.Database;
let legacy: Legacy;
let legacyTopics: Legacy;
let repo: MessagesRepository;
let topicsRepo: TopicsRepository;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-messages-"));
  fs.mkdirSync(path.join(dir, "data"));
  process.chdir(dir);
  process.env.NODE_ENV = "test";
  process.env.MESSAGES_KEY = "6d657373616765732d6b65792d666f722d636f6e74726163742d74657374732d";
  process.env.UPLOADS_KEY = "75706c6f6164732d6b65792d666f722d636f6e74726163742d74657374732d21";
  const require = createRequire(path.join(SERVER, "db.js"));
  conn = require(path.join(SERVER, "db.js"));
  legacy = require(path.join(SERVER, "data", "messages.js"));
  legacyTopics = require(path.join(SERVER, "data", "topics.js"));
  const chats = require(path.join(SERVER, "data", "chats.js"));
  const db = drizzle({ client: conn, schema }) as Db;
  repo = new MessagesRepository(db);
  topicsRepo = new TopicsRepository(db);

  const base = { pinned: false, muted: false, archived: false, createdAt: "2026-01-01T00:00:00.000Z" };
  for (const id of ["c_l", "c_r"]) {
    await chats.createChat({ ...base, id, type: "group", title: "Группа", memberIds: ["u_a", "u_b", "u_c"], ownerId: "u_a" });
  }
  for (const id of ["c_sl", "c_sr"]) {
    await chats.createChat({ ...base, id, type: "dm", title: "", memberIds: ["u_a", "u_b"], secret: true, secretDevices: { u_a: "d" } });
  }
});

afterAll(() => {
  conn?.close();
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(dir, { recursive: true, force: true });
});

// Как в HTTP-ответе: undefined-поля пропадают.
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));
const rowOf = (id: string) => conn.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown>;

// Одно и то же сообщение в двух чатах-близнецах: c_l пишет старый код, c_r — репозиторий.
let seq = 0;
function sample(chatId: string, extra: Partial<NewMessage> = {}): NewMessage {
  seq += 1;
  return {
    id: `m_${chatId}_${seq}`,
    chatId,
    senderId: "u_a",
    text: "привет https://example.com",
    createdAt: `2026-02-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    readByIds: ["u_a"],
    ...extra,
  };
}
const RICH: Partial<NewMessage> = {
  type: "text",
  pinned: true,
  replyToId: "m_x",
  forwardedFrom: { chatId: "c_x", chatTitle: "X", senderId: "u_x", senderName: "Икс", linkAllowed: false },
  attachments: [
    { kind: "voice", url: "/uploads/v.ogg", transcript: "расшифровка голосового" },
    { kind: "poll", meta: { question: "?", options: ["а", "б", "в"], voterIds: [[], [], []], votes: [0, 0, 0] } },
    { kind: "checklist", meta: { title: "Дела", items: [{ id: 1, text: "раз" }, { id: 2, text: "два", doneBy: "u_b", doneAt: "2026-01-01T00:00:00.000Z" }] } },
    { kind: "location", meta: { lat: 1, lng: 2, live: true, expiresAt: "2999-01-01T00:00:00.000Z" } },
  ],
  sticker: { kind: "image", url: "/uploads/s.webp", emoji: "🙂" },
  customEmoji: [{ layers: [] }],
  reactions: [{ emoji: "👍", userIds: ["u_b"] }],
  mentionedUserIds: ["u_b"],
  topicId: "topic_x",
  storyReply: { url: "/uploads/st.jpg", kind: "image", authorName: "Б" },
  anchorForPostId: "m_post",
  signedBy: "Админ",
  views: 3,
  commentCount: 2,
  paidStars: 5,
  anonymous: true,
  effect: "🔥",
  visibleToId: "u_b",
};

/** Колонки строки без id/chatId и шифротекстов (у шифротекста случайный IV); «сейчас» — меткой. */
function plainColumns(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, chatId: _chatId, text: _text, attachments: stored, ...rest } = row;
  const attachments = typeof stored === "string" ? stored.replace(/"doneAt":"(?!2026-01-01T)[^"]*"/g, '"doneAt":"now"') : stored;
  const list = attachments ? (JSON.parse(String(attachments)) as Record<string, unknown>[]) : attachments;
  return { ...rest, attachments: Array.isArray(list) ? list.map(({ transcript: _t, ...a }) => ({ ...a, sealed: !!_t })) : list };
}
/** Сообщение без id/chatId — для сравнения двойников. */
function same(m: Message | undefined) {
  const { id: _id, chatId: _chatId, ...rest } = asJson(m) as Message;
  return rest;
}

describe("сообщение совпадает с server/data/messages.js", () => {
  it("создание: те же колонки, шифротекст открывают оба", async () => {
    for (const [l, r] of [
      ["c_l", "c_r"],
      ["c_sl", "c_sr"],
    ] as const) {
      for (const extra of [{}, RICH, { text: "", attachments: [] }, { text: undefined, threadRootId: "m_root" }]) {
        const mine = sample(r, extra);
        const theirs = { ...mine, id: mine.id.replace(r, l), chatId: l };
        const viaRepo = repo.create(mine);
        await legacy.addMessage(theirs);
        expect(plainColumns(rowOf(mine.id))).toEqual(plainColumns(rowOf(theirs.id)));
        // Каждый читает записанное другим.
        expect(asJson(await legacy.getMessage(mine.id))).toEqual(asJson(viaRepo));
        expect(same(repo.findById(theirs.id))).toEqual(same(viaRepo));
        const text = String(rowOf(mine.id).text);
        if (mine.text) expect(text.startsWith("enc2:")).toBe(true);
      }
    }
  });

  it("чтение: все строки, битый JSON, страницы, ветки, поиск, дни", async () => {
    conn.prepare("INSERT INTO messages (id, chatId, senderId, createdAt, reactions, readByIds, deletedForIds, attachments, forwardedFrom, mentionedUserIds) VALUES ('m_broken', 'c_l', 'u_b', '2026-03-01T00:00:00.000Z', '{', 'x', '[', '[1', '{', '')").run();
    await legacy.addMessage(sample("c_l", { id: "m_hidden", deletedForIds: ["u_b"] }));
    await legacy.addMessage(sample("c_l", { id: "m_reply", threadRootId: "m_hidden", text: "ответ в ветке" }));
    await legacy.addMessage(sample("c_l", { id: "m_topic", topicId: "topic_1", text: "в теме" }));
    for (const { id } of conn.prepare("SELECT id FROM messages").all() as { id: string }[]) {
      expect(asJson(repo.findById(id)), id).toEqual(asJson(await legacy.getMessage(id)));
    }
    const queries = [
      { limit: 60, before: null, beforeId: null },
      { limit: 3, before: null, beforeId: null },
      { limit: 2, before: "2026-02-01T00:00:10.000Z", beforeId: null },
      { limit: 2, before: "2026-02-01T00:00:10.000Z", beforeId: "m_c_l_9" },
      { limit: 60, before: null, beforeId: null, topic: null },
      { limit: 60, before: null, beforeId: null, topic: "topic_1" },
    ];
    for (const viewer of ["u_a", "u_b"]) {
      for (const cleared of [undefined, "2026-02-01T00:00:05.000Z"]) {
        for (const q of queries) {
          expect(asJson(repo.findPage("c_l", viewer, cleared, q)), JSON.stringify({ viewer, cleared, q })).toEqual(
            asJson(legacy.listMessagesPage("c_l", viewer, cleared, q))
          );
        }
      }
    }
    expect(asJson(repo.listThreadReplies("m_hidden"))).toEqual(asJson(await legacy.listThreadReplies("m_hidden")));
    expect(asJson(repo.findById("m_nope"))).toEqual(asJson(await legacy.getMessage("m_nope")));

    const { searchQuery } = createRequire(path.join(SERVER, "db.js"))(path.join(SERVER, "lib", "textCrypto.js"));
    for (const q of ["привет", "прив", "ответ ветке", "нет-такого", "в теме"]) {
      for (const chatIds of [["c_l"], ["c_l", "c_r"], ["c_r"]]) {
        expect(asJson(repo.search(chatIds, searchQuery(q), 3)), q).toEqual(asJson(legacy.searchInChats(chatIds, q, { limit: 3 })));
      }
    }
    expect(repo.search(["c_l"], '"', 3)).toEqual([]);

    for (const tz of [0, 180, -600, 5.5]) {
      expect(repo.listDays("c_l", "2026-02", tz)).toEqual(legacy.listMessageDays("c_l", { month: "2026-02", tzOffsetMinutes: tz }));
      for (const day of ["2026-01-31", "2026-02-01", "2026-03-01", "2999-01-01"]) {
        expect(repo.firstOfDay("c_l", day, tz)).toEqual(legacy.firstMessageOfDay("c_l", { day, tzOffsetMinutes: tz }));
      }
    }
  });

  it("последнее своё сообщение и «уже писал» — как listMessages", async () => {
    for (const user of ["u_a", "u_b", "u_c"]) {
      const own = (await legacy.listMessages("c_l", user)).filter((m: Message) => m.senderId === user);
      expect(repo.lastSentAt("c_l", user), user).toBe(own[own.length - 1]?.createdAt);
      expect(repo.hasSentIn("c_l", user), user).toBe(own.length > 0);
    }
  });

  it("правки пишут те же строки", async () => {
    const pairs: [string, (id: string) => Promise<unknown>, (m: Message) => Message][] = [
      ["edit", (id) => legacy.editMessage(id, "новый текст"), (m) => edits.editText(m, "новый текст")],
      ["pin", (id) => legacy.togglePin(id, true), (m) => edits.setPinned(m, true)],
      ["unpin", (id) => legacy.togglePin(id, false), (m) => edits.setPinned(m, false)],
      ["react", (id) => legacy.toggleReaction(id, "🔥", "u_b", { maxReactionsPerUser: 1 }), (m) => edits.toggleReaction(m, "🔥", "u_b", 1)],
      ["react-off", (id) => legacy.toggleReaction(id, "👍", "u_b", { maxReactionsPerUser: 3 }), (m) => edits.toggleReaction(m, "👍", "u_b", 3)],
      ["react-new", (id) => legacy.toggleReaction(id, "🎉", "u_c", { maxReactionsPerUser: 3 }), (m) => edits.toggleReaction(m, "🎉", "u_c", 3)],
      ["vote", (id) => legacy.votePoll(id, 1, "u_b"), (m) => edits.votePoll(m, 1, "u_b")],
      ["vote-bad", (id) => legacy.votePoll(id, 7, "u_b"), (m) => edits.votePoll(m, 7, "u_b")],
      ["retract", (id) => legacy.retractPollVote(id, "u_b"), (m) => edits.retractPollVote(m, "u_b")],
      ["close", (id) => legacy.closePoll(id), (m) => edits.closePoll(m)],
      ["check", (id) => legacy.toggleChecklistItem(id, 1, "u_c"), (m) => edits.toggleChecklistItem(m, 1, "u_c")],
      ["uncheck", (id) => legacy.toggleChecklistItem(id, 2, "u_c"), (m) => edits.toggleChecklistItem(m, 2, "u_c")],
      ["add-items", (id) => legacy.addChecklistItems(id, ["три", "четыре"], 3), (m) => edits.addChecklistItems(m, ["три", "четыре"], 3)],
      ["hide", (id) => legacy.deleteMessageForMe(id, "u_b"), (m) => edits.deleteForUser(m, "u_b")],
      ["location", (id) => legacy.updateLiveLocation(id, "u_a", 5, 6), (m) => edits.updateLiveLocation(m, "u_a", 5, 6)],
      ["location-other", (id) => legacy.updateLiveLocation(id, "u_b", 5, 6), (m) => edits.updateLiveLocation(m, "u_b", 5, 6)],
      ["preview", (id) => legacy.setLinkPreview(id, { url: "https://example.com", title: "Пример" }), (m) => edits.setLinkPreview(m, { url: "https://example.com", title: "Пример" })],
      ["comment", (id) => legacy.incrementCommentCount(id), (m) => edits.incrementCommentCount(m)],
    ];
    for (const [l, r] of [
      ["c_l", "c_r"],
      ["c_sl", "c_sr"],
    ] as const) {
      const mine = sample(r, RICH);
      const theirs = { ...mine, id: mine.id.replace(r, l), chatId: l };
      repo.create(mine);
      await legacy.addMessage(theirs);
      for (const [name, viaLegacy, viaRepo] of pairs) {
        const textBefore = rowOf(mine.id).text;
        await viaLegacy(theirs.id);
        const updated = repo.mutate(mine.id, viaRepo);
        const { editedAt: e1, ...a } = plainColumns(rowOf(mine.id));
        const { editedAt: e2, ...b } = plainColumns(rowOf(theirs.id));
        expect(a, name).toEqual(b);
        expect(!!e1, name).toBe(!!e2);
        // Текст не менялся — шифротекст тот же; поменялся — открывается старым кодом.
        if (name !== "edit") expect(rowOf(mine.id).text, name).toBe(textBefore);
        expect(asJson(await legacy.getMessage(mine.id)), name).toEqual(asJson(updated));
      }
    }
    expect(repo.mutate("m_nope", (m) => m)).toBeUndefined();
  });

  it("прочтение: те же отметки, время и chat_reads", async () => {
    for (const [chatId, run] of [
      ["c_l", (record: boolean) => legacy.markChatRead("c_l", "u_c", { recordTime: record })],
      ["c_r", async (record: boolean) => repo.markChatRead("c_r", "u_c", record)],
    ] as const) {
      const changed = await run(false);
      expect(changed.length, chatId).toBeGreaterThan(0);
      expect(await run(true), chatId).toEqual([]);
    }
    const marks = (chatId: string) =>
      (conn.prepare("SELECT readByIds, readAt, readTimes FROM messages WHERE chatId = ? ORDER BY createdAt, id").all(chatId) as Record<string, string | null>[]).map(
        (r) => ({ readByIds: r.readByIds, readAt: r.readAt, readers: Object.keys(JSON.parse(r.readTimes ?? "{}")) })
      );
    // В c_l больше сообщений (чтение выше), сверяем общую часть — те, что созданы парами.
    const left = marks("c_l").filter((m) => m.readers.length);
    const right = marks("c_r").filter((m) => m.readers.length);
    expect(right.length).toBeGreaterThan(0);
    expect(right.every((m) => m.readAt === null && JSON.parse(m.readByIds!).includes("u_c"))).toBe(true);
    expect(left.every((m) => m.readAt === null && JSON.parse(m.readByIds!).includes("u_c"))).toBe(true);
    const reads = (chatId: string) => conn.prepare("SELECT lastReadAt FROM chat_reads WHERE chatId = ? AND userId = 'u_c'").get(chatId);
    expect(reads("c_r")).toEqual({ lastReadAt: (conn.prepare("SELECT MAX(createdAt) AS at FROM messages WHERE chatId = 'c_r'").get() as { at: string }).at });

    // recordTime пишет readAt, повторное прочтение его не меняет.
    const fresh = sample("c_r", { senderId: "u_b", readByIds: ["u_b"] });
    repo.create(fresh);
    expect(repo.markChatRead("c_r", "u_a", true)).toContain(fresh.id);
    const readAt = rowOf(fresh.id).readAt;
    expect(typeof readAt).toBe("string");
    for (const id of [fresh.id, "m_broken", "m_nope"]) expect(repo.readersOf(id), id).toEqual(legacy.readersOf(id));
  });

  it("удаление отдаёт ссылки на файлы", async () => {
    const mine = repo.create(sample("c_r", RICH));
    const row = rowOf(mine.id);
    expect(repo.delete(mine.id)).toEqual({ chatId: "c_r", attachments: row.attachments, sticker: row.sticker });
    expect(rowOf(mine.id)).toBeUndefined();
    expect(repo.delete(mine.id)).toBeUndefined();
  });
});

describe("тема совпадает с server/data/topics.js", () => {
  it("создание, правка, список, удаление с сообщениями", async () => {
    const created = topicsRepo.create("c_r", { title: "Новости", icon: "📰", color: "#cb86db" }, "u_a");
    const theirs = legacyTopics.createTopic("c_l", { title: "Новости", icon: "📰", color: "#cb86db" }, "u_a");
    const strip = ({ id: _id, chatId: _c, createdAt: _t, ...rest }: Record<string, unknown>) => rest;
    expect(strip(asJson(created) as Record<string, unknown>)).toEqual(strip(asJson(theirs) as Record<string, unknown>));
    // Цвет не из палитры — следующий по кругу.
    const auto = topicsRepo.create("c_r", { title: "Второй", icon: null, color: "red" }, "u_b");
    const autoTheirs = legacyTopics.createTopic("c_l", { title: "Второй", icon: null, color: "red" }, "u_b");
    expect(auto.color).toBe(autoTheirs.color);
    expect(topicsRepo.count("c_r")).toBe(legacyTopics.countTopics("c_r"));

    for (const patch of [{ title: "Переименована" }, { icon: "" }, { icon: "🔥", color: "#8eee98" }, { color: "nope", closed: true }, { closed: false }]) {
      const a = topicsRepo.update(created.id, patch);
      const b = legacyTopics.updateTopic(theirs.id, patch);
      expect(strip(asJson(a) as Record<string, unknown>), JSON.stringify(patch)).toEqual(strip(asJson(b) as Record<string, unknown>));
    }
    expect(topicsRepo.update("topic_nope", { title: "x" })).toBeUndefined();

    repo.create(sample("c_r", { topicId: created.id }));
    repo.create(sample("c_r", { topicId: created.id, threadRootId: "m_root" }));
    expect(asJson(topicsRepo.list("c_r"))).toEqual(asJson(legacyTopics.listTopics("c_r")));
    expect(asJson(topicsRepo.findById(created.id))).toEqual(asJson(legacyTopics.getTopic(created.id)));

    const ids = conn.prepare("SELECT id FROM messages WHERE topicId = ?").all(created.id).map((r) => (r as { id: string }).id);
    expect(topicsRepo.delete(created.id).sort()).toEqual(ids.sort());
    expect(topicsRepo.findById(created.id)).toBeUndefined();
    expect(conn.prepare("SELECT COUNT(*) AS n FROM messages WHERE topicId = ?").get(created.id)).toEqual({ n: 0 });
  });
});
